import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type * as VsCode from 'vscode';
import type { Route } from '../../src/core/handle';
import type { CommentRef, InvokeName, Result, SignInState, WorkspaceApi } from '../../src/shared/contract';
import { DESIGN_REPO } from '../../src/shared/config';
import { escapeHtml } from '../../src/shared/html';
import REVIEW_TAB from '../../src/page/reviewTab?page';
import { prototypeKey, sitePath } from '../../src/shared/designPaths';
import { isPrototypeName } from '../../src/shared/prototypeNames';
import { toResult, valueOf } from '../../src/shared/result';
import { KEY_FRAGMENT, type RelayCall, type RelayTell, readRelayAsk } from '../../src/shared/reviewRelay';
import { buildSite } from '../../src/site/buildSite';
import { callRoute } from './bridge';
import { newNonce } from './html';
import { type Review, reviewsOf } from './messages';

export const reviewPath = (projectId: string, name: string): string => {
	const at = sitePath(projectId, name);
	if (at === null) throw new Error(`${name} is not a prototype, so it has no review page.`);
	return at;
};

/**
 * Relays only to the page's own address (`shared/reviewRelay`): a message from anywhere else (the prototype in the bar, a
 * frame it makes) goes nowhere.
 */
export const reviewPage = ({ src, title, nonce }: { src: string; title: string; nonce: string }): string => {
	const origin = new URL(src).origin;
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${origin}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'">
<style nonce="${nonce}">html, body, iframe { margin: 0; padding: 0; border: 0; width: 100%; height: 100vh; display: block; }</style>
<title>${escapeHtml(title)}</title>
</head>
<body><iframe src="${escapeHtml(src)}" title="${escapeHtml(title)}"></iframe>
<script nonce="${nonce}">
${REVIEW_TAB.replace(/<\/script/gi, '<\\/script')}
__fdPage.startReviewTab(${JSON.stringify(origin)});
</script>
</body>
</html>`;
};

interface ReviewAnswers {
	routes: () => ReadonlyMap<InvokeName, Route>;
	signIn: () => Promise<SignInState>;
	address: (review: Review, comment: CommentRef, newVersion: boolean) => Promise<unknown>;
	written: () => void;
}

const isRef = (v: unknown): v is CommentRef =>
	typeof v === 'object' && v !== null && Number.isSafeInteger((v as CommentRef).thread) && Number.isSafeInteger((v as CommentRef).id);

/**
 * Only on this review's own comments: read and made only on its project's prototypes, and changed or Addressed only when
 * this tab has been shown or made it (`seen`), so a page gone wrong reaches no other project's.
 */
export const answerReview = async (
	answers: ReviewAnswers,
	review: Review,
	name: RelayCall,
	args: unknown[],
	seen: Set<number>,
): Promise<Result<unknown>> => {
	const result = await answered(answers, review, name, args, seen);
	if (result.ok && WRITES.has(name)) answers.written();
	if (result.ok && (name === 'readComments' || name === 'postComment'))
		for (const c of Array.isArray(result.value) ? result.value : [result.value]) if (isRef(c)) seen.add(c.thread);
	return result;
};

const isPrototypeOf = (projectId: string, branch: unknown): boolean => {
	const prefix = prototypeKey(projectId, '');
	return typeof branch === 'string' && branch.startsWith(prefix) && isPrototypeName(branch.slice(prefix.length));
};

const ON_A_COMMENT = new Set<RelayCall>(['moveComment', 'resolveComment', 'deleteComment', 'address']);

/** After one, the counts are read again. */
const WRITES = new Set<RelayCall>(['postComment', 'moveComment', 'resolveComment', 'deleteComment']);

const answered = async (answers: ReviewAnswers, review: Review, name: RelayCall, args: unknown[], seen: Set<number>): Promise<Result<unknown>> => {
	if (name === 'signIn') return toResult(answers.signIn());
	if (name === 'address' && !(args.length >= 1 && args.length <= 3 && isRef(args[0]) && (args[2] === undefined || typeof args[2] === 'boolean')))
		return { ok: false, error: 'Address is given one comment, and may say the version it is on and whether to make a new one.' };
	if (name === 'address' && args.length >= 2 && !isPrototypeOf(review.projectId, args[1]))
		return { ok: false, error: `This review is of ${review.projectId}, so it comments only on ${review.projectId}’s prototypes.` };
	if (ON_A_COMMENT.has(name) && !(isRef(args[0]) && seen.has(args[0].thread)))
		return { ok: false, error: 'That comment is not one of this review’s.' };
	if (name === 'address') {
		const on = args.length >= 2 ? { ...review, name: (args[1] as string).slice(prototypeKey(review.projectId, '').length) } : review;
		return toResult(answers.address(on, args[0] as CommentRef, args[2] === true));
	}
	if ((name === 'readComments' || name === 'postComment') && !(args[0] === review.projectId && isPrototypeOf(review.projectId, args[1])))
		return { ok: false, error: `This review is of ${review.projectId}, so it comments only on ${review.projectId}’s prototypes.` };
	return callRoute(answers.routes(), name, args);
};

type Panel = Pick<VsCode.WebviewPanel, 'title' | 'active' | 'visible' | 'reveal' | 'onDidChangeViewState' | 'onDidDispose'> & {
	webview: Pick<VsCode.Webview, 'html' | 'onDidReceiveMessage' | 'postMessage'>;
};

/**
 * The site is built afresh each time so it is the records as they are. One tab per project, so another of its prototypes
 * shows there.
 */
export class Reviews {
	private readonly tabs = new Map<string, { panel: Panel; review: Review }>();
	/**
	 * By the key's hash: found without comparing, so how long a wrong one takes says nothing of a right one. Kept until
	 * VS Code reloads.
	 */
	private readonly keys = new Map<string, { review: Review; seen: Set<number> }>();

	constructor(
		private readonly deps: {
			vscode: {
				window: {
					createWebviewPanel(
						type: string,
						title: string,
						column: VsCode.ViewColumn,
						options: VsCode.WebviewPanelOptions & VsCode.WebviewOptions,
					): Panel;
				};
				ViewColumn: typeof VsCode.ViewColumn;
			};
			build: (records: string) => void | Promise<void>;
			serve: () => Promise<string>;
			answer: (review: Review, name: RelayCall, args: unknown[], seen: Set<number>) => Promise<Result<unknown>>;
			log?: Pick<VsCode.LogOutputChannel, 'info'>;
			onShown?: () => void;
		},
	) {}

	async address({ records, projectId, name }: Review & { records: string }): Promise<string> {
		const path = reviewPath(projectId, name);
		await this.deps.build(records);
		return `${await this.deps.serve()}${path}`;
	}

	/**
	 * A new key for this review alone, in the fragment, which a browser never sends to a server, and in characters no
	 * opener re-encodes.
	 */
	async inBrowser({ records, ...review }: Review & { records: string }): Promise<string> {
		const url = await this.address({ records, ...review });
		const key = randomBytes(16).toString('base64url');
		this.keys.set(hashOf(key), { review, seen: new Set() });
		return `${url}#${KEY_FRAGMENT}${key}`;
	}

	/** Null when the key is none made here, or what was asked is not exactly an ask, which the server refuses. */
	async answerBrowser(key: string, raw: unknown): Promise<RelayTell | null> {
		const held = this.keys.get(hashOf(key));
		const ask = held ? readRelayAsk(raw) : null;
		if (!held || ask === null) return null;
		this.deps.log?.info(`The review of ${held.review.title}, in the browser, asked ${ask.name}.`);
		return { dsnr: 'answer', id: ask.id, result: await this.deps.answer(held.review, ask.name, ask.args, held.seen) };
	}

	async open({ records, ...review }: Review & { records: string }): Promise<void> {
		const src = await this.address({ records, ...review });
		const open = this.tabs.get(review.projectId);
		this.shows(open ?? this.make(review), review, src);
		if (open) open.panel.reveal();
	}

	private shows(tab: { panel: Panel; review: Review }, review: Review, src: string): void {
		tab.review = review;
		tab.panel.title = review.title;
		tab.panel.webview.html = reviewPage({ src, title: review.title, nonce: newNonce() });
	}

	/** In a tab or by a browser's key: what is built for them must stay. */
	inUse(): string[] {
		return [...new Set([...this.tabs.keys(), ...[...this.keys.values()].map((k) => k.review.projectId)])];
	}

	active(): Review | undefined {
		return [...this.tabs.values()].find((t) => t.panel.active)?.review;
	}

	shown(): string[] {
		return [...this.tabs].filter(([, t]) => t.panel.visible).map(([id]) => id);
	}

	private make(review: Review): { panel: Panel; review: Review } {
		const panel = this.deps.vscode.window.createWebviewPanel('dsnr.review', review.title, this.deps.vscode.ViewColumn.Active, {
			enableScripts: true,
		});
		const shown = { panel, review };
		this.tabs.set(review.projectId, shown);
		// By thread: the only comments its page may change.
		const seen = new Set<number>();
		panel.webview.onDidReceiveMessage(async (raw: unknown) => {
			const ask = readRelayAsk(raw);
			if (ask === null) return;
			this.deps.log?.info(`The review of ${shown.review.title} asked ${ask.name}.`);
			const result = await this.deps.answer(shown.review, ask.name, ask.args, seen);
			await panel.webview.postMessage({ dsnr: 'answer', id: ask.id, result } satisfies RelayTell);
		});
		panel.onDidChangeViewState(() => this.deps.onShown?.());
		panel.onDidDispose(() => {
			this.tabs.delete(review.projectId);
			this.deps.onShown?.();
		});
		this.deps.onShown?.();
		return shown;
	}
}

/** So the key itself is never kept or compared. */
const hashOf = (key: string): string => createHash('sha256').update(key).digest('hex');

/** Pages are served from `pagesAt`, their own address (the README's Review isolation), not beside their bar. */
export const buildReviewSite = (siteDir: string, viewerDir: string) => (records: string, pagesAt: string) => {
	mkdirSync(dirname(siteDir), { recursive: true });
	buildSite({
		designRoot: dirname(records),
		outDir: siteDir,
		viewer: { dir: viewerDir, ref: DESIGN_REPO },
		pagesAt,
	});
};

export const REVIEW_KEY = 'review';

export const siteIn = (storage: string): string => join(storage, 'review-site');

export const pickReview = async (
	window: Pick<typeof VsCode.window, 'showQuickPick'>,
	api: Pick<WorkspaceApi, 'listProjects'>,
	tell: (message: string) => void,
): Promise<Review | undefined> => {
	const items = valueOf(await api.listProjects())
		.flatMap(reviewsOf)
		.map((review) => ({ label: review.title, review }));
	if (items.length === 0) return void tell('There is no prototype to review here yet.');
	return (await window.showQuickPick(items, { placeHolder: 'Open a prototype for review' }))?.review;
};
