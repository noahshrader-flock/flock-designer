import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type * as VsCode from 'vscode';
import type { Route } from '../../src/main/handle';
import type { CommentRef, InvokeName, Result, SignInState, WorkspaceApi } from '../../src/shared/contract';
import { DESIGN_REPO } from '../../src/shared/config';
import { escapeHtml } from '../../src/shared/html';
import { prototypeKey } from '../../src/shared/designPaths';
import { isPrototypeName, parsePrototypeName } from '../../src/shared/prototypeNames';
import { toResult, valueOf } from '../../src/shared/result';
import { KEY_FRAGMENT, type RelayCall, type RelayTell, readRelayAsk } from '../../src/shared/reviewRelay';
import { buildSite } from '../../src/site/buildSite';
import { callRoute } from './bridge';
import { newNonce } from './html';
import { type Review, reviewsOf } from './messages';

/** Where a prototype's review is on the site, as the site lays it out: `<project>/v<version>/i<iteration>/`. */
export const reviewPath = (projectId: string, name: string): string => {
	const parsed = parsePrototypeName(name);
	if (!parsed) throw new Error(`${name} is not a prototype, so it has no review page.`);
	return `${projectId}/v${parsed.version}/i${parsed.iteration}/`;
};

/**
 * The tab's page: only the review, framed from this machine, and its one script, which says hello to the page once it
 * has loaded (so the page knows DSNR frames it), passes what the page asks up to the extension and the answers back
 * down, to the page's own address and nothing else (`shared/reviewRelay`). Each side reads what it is sent. A message
 * from anywhere else (the prototype's page in the bar, a frame it makes) goes nowhere.
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
const vscode = acquireVsCodeApi();
const frame = document.querySelector('iframe');
const page = ${JSON.stringify(origin)};
frame.addEventListener('load', () => frame.contentWindow.postMessage({ dsnr: 'hello' }, page));
// Only the bar may ask the extension, and only VS Code answers it: its host frame posts on this tab's own origin, which no
// frame inside it has (the bar and the prototype's page are this machine's, any frame they make theirs or none). VS Code
// makes window.parent this window itself, so the origin is what says who sent it.
window.addEventListener('message', (e) => {
	if (e.source === frame.contentWindow && e.origin === page) vscode.postMessage(e.data);
	else if (e.origin === location.origin) frame.contentWindow.postMessage(e.data, page);
});
</script>
</body>
</html>`;
};

/** How the extension answers a review page: the core's table, VS Code's sign-in, and Address. */
interface ReviewAnswers {
	routes: () => ReadonlyMap<InvokeName, Route>;
	signIn: () => Promise<SignInState>;
	/** Address, on the iteration the page is on, shown where it was asked from (BROWSER_COMMENTS_PLAN D1): the iteration it shows. */
	address: (review: Review, comment: CommentRef, from: AskedFrom) => Promise<unknown>;
	/** Told once a comment was written (made, moved, resolved, deleted, addressed), so what counts them is read again. */
	written: () => void;
}

/** Where a review's page asked from: its tab in VS Code, or the browser, by a key (`Reviews.inBrowser`). */
export type AskedFrom = 'tab' | 'browser';

const isRef = (v: unknown): v is CommentRef =>
	typeof v === 'object' && v !== null && Number.isSafeInteger((v as CommentRef).thread) && Number.isSafeInteger((v as CommentRef).id);

/**
 * What a review page asked (`RelayCall`), answered: a comment call by the core, as the app's window is answered; signing
 * in by VS Code; Address by the extension. **Only on this review's own comments:** read and made only on its project's
 * prototypes (whatever the page says its project is, the branch is what is read), and changed or Addressed only when it is
 * one this tab has been shown or has made (`seen`, the tab's own threads). A page that is not what it should be can then
 * reach no other project's comments.
 */
export const answerReview = async (
	answers: ReviewAnswers,
	review: Review,
	name: RelayCall,
	args: unknown[],
	seen: Set<number>,
	from: AskedFrom = 'tab',
): Promise<Result<unknown>> => {
	const result = await answered(answers, review, name, args, seen, from);
	if (result.ok && WRITES.has(name)) answers.written();
	if (result.ok && (name === 'readComments' || name === 'postComment'))
		for (const c of Array.isArray(result.value) ? result.value : [result.value]) if (isRef(c)) seen.add(c.thread);
	return result;
};

/** Whether a branch is one of a project's prototypes (`prototype/<project>/<name>`): its own, by its name. */
const isPrototypeOf = (projectId: string, branch: unknown): boolean => {
	const prefix = prototypeKey(projectId, '');
	return typeof branch === 'string' && branch.startsWith(prefix) && isPrototypeName(branch.slice(prefix.length));
};

/** The calls that act on one comment, by its reference, first. */
const ON_A_COMMENT = new Set<RelayCall>(['moveComment', 'resolveComment', 'deleteComment', 'address']);

/** The calls that change a comment, or what a comment says of itself (Address): after one, the counts are read again. */
const WRITES = new Set<RelayCall>(['postComment', 'moveComment', 'resolveComment', 'deleteComment', 'address']);

const answered = async (
	answers: ReviewAnswers,
	review: Review,
	name: RelayCall,
	args: unknown[],
	seen: Set<number>,
	from: AskedFrom,
): Promise<Result<unknown>> => {
	if (name === 'signIn') return toResult(answers.signIn());
	// Address is given one comment, and may say which of the review's prototypes the page is on (a browser's moves).
	if (name === 'address' && !((args.length === 1 || args.length === 2) && isRef(args[0])))
		return { ok: false, error: 'Address is given one comment.' };
	if (name === 'address' && args.length === 2 && !isPrototypeOf(review.projectId, args[1]))
		return { ok: false, error: `This review is of ${review.projectId}, so it comments only on ${review.projectId}’s prototypes.` };
	if (ON_A_COMMENT.has(name) && !(isRef(args[0]) && seen.has(args[0].thread)))
		return { ok: false, error: 'That comment is not one of this review’s.' };
	if (name === 'address') {
		const on = args.length === 2 ? { ...review, name: (args[1] as string).slice(prototypeKey(review.projectId, '').length) } : review;
		return toResult(answers.address(on, args[0] as CommentRef, from));
	}
	if ((name === 'readComments' || name === 'postComment') && !(args[0] === review.projectId && isPrototypeOf(review.projectId, args[1])))
		return { ok: false, error: `This review is of ${review.projectId}, so it comments only on ${review.projectId}’s prototypes.` };
	return callRoute(answers.routes(), name, args);
};

type Panel = Pick<VsCode.WebviewPanel, 'title' | 'active' | 'reveal' | 'onDidDispose'> & {
	webview: Pick<VsCode.Webview, 'html' | 'onDidReceiveMessage' | 'postMessage'>;
};

/**
 * Prototypes' reviews in VS Code (ELECTRON_MIGRATION_PLAN 2A, 4.2): each its page on the site, with its own review bar
 * (versions, its states, comments), built from the design repository on this machine (`build`), served from this machine
 * (`serve`), and framed in an editor tab, one for each project, so opening another of its prototypes (or the one Address
 * made) shows it there. Built again each time, so it is the records as they are. What the page asks is read in exactly
 * its shape and answered (`answer`).
 */
export class Reviews {
	private readonly tabs = new Map<string, { panel: Panel; review: Review }>();
	/**
	 * The keys made for the browser (`inBrowser`), each for one review, with what it has been shown, by the key's hash: a
	 * key is found without comparing it, so how long a wrong one takes says nothing of a right one. Kept until VS Code
	 * reloads (BROWSER_COMMENTS_PLAN D2).
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
			/** Builds the site from the design repository's records, into the folder `serve` serves. */
			build: (records: string) => void | Promise<void>;
			/** Serves the built site from this machine, and says its address. */
			serve: () => Promise<string>;
			/** What a review's page asked, answered with what it has been shown (`seen`), and where it asked from. */
			answer: (review: Review, name: RelayCall, args: unknown[], seen: Set<number>, from: AskedFrom) => Promise<Result<unknown>>;
			/** Where a run from source says what each page asked: View › Output › DSNR. */
			log?: Pick<VsCode.LogOutputChannel, 'info'>;
		},
	) {}

	/**
	 * Where a review's page is: built again from the records, so it is as they are, and served from this machine. For a
	 * tab, and for a browser, which opens the same page outside VS Code (where it has no DSNR to comment through).
	 */
	async address({ records, projectId, name }: Review & { records: string }): Promise<string> {
		const path = reviewPath(projectId, name);
		await this.deps.build(records);
		return `${await this.deps.serve()}${path}`;
	}

	/**
	 * Where a review's page is for the browser, with a key of its own in the fragment (`#dsnr-key-<key>`, only characters no
	 * link is ever re-encoded in, as VS Code's opener may), which a browser never sends to a server: the bar asks DSNR through this machine's server with it (`answerBrowser`), as a tab asks through VS Code.
	 * A new key each time, for this review alone, with its own list of what it has been shown.
	 */
	async inBrowser({ records, ...review }: Review & { records: string }): Promise<string> {
		const url = await this.address({ records, ...review });
		const key = randomBytes(16).toString('base64url');
		this.keys.set(hashOf(key), { review, seen: new Set() });
		return `${url}#${KEY_FRAGMENT}${key}`;
	}

	/**
	 * A browser's ask, with its key, answered as that review's tab is answered (`answer`, with what this key has been
	 * shown); null when the key is none made here, or what was asked is not exactly an ask, which the server refuses.
	 */
	async answerBrowser(key: string, raw: unknown): Promise<RelayTell | null> {
		const held = this.keys.get(hashOf(key));
		const ask = held ? readRelayAsk(raw) : null;
		if (!held || ask === null) return null;
		this.deps.log?.info(`The review of ${held.review.title}, in the browser, asked ${ask.name}.`);
		return { dsnr: 'answer', id: ask.id, result: await this.deps.answer(held.review, ask.name, ask.args, held.seen, 'browser') };
	}

	async open({ records, ...review }: Review & { records: string }): Promise<void> {
		const src = await this.address({ records, ...review });
		const open = this.tabs.get(review.projectId);
		this.shows(open ?? this.make(review), review, src);
		// A tab already open is brought forward; a new one opens in front.
		if (open) open.panel.reveal();
	}

	/**
	 * A review shown in its project's tab if one is open, as Address from the browser keeps VS Code in step (BROWSER_COMMENTS_PLAN
	 * D1): not brought in front of the browser, and none opened. The site is built either way, so the browser has the page.
	 */
	async showIfOpen({ records, ...review }: Review & { records: string }): Promise<void> {
		const src = await this.address({ records, ...review });
		const open = this.tabs.get(review.projectId);
		if (open) this.shows(open, review, src);
	}

	private shows(tab: { panel: Panel; review: Review }, review: Review, src: string): void {
		tab.review = review;
		tab.panel.title = review.title;
		tab.panel.webview.html = reviewPage({ src, title: review.title, nonce: newNonce() });
	}

	/** The projects a review is open on, in a tab or by a browser's key: what is built for them must stay. */
	inUse(): string[] {
		return [...new Set([...this.tabs.keys(), ...[...this.keys.values()].map((k) => k.review.projectId)])];
	}

	/** The review in front, if one is: what its title bar's actions act on. */
	active(): Review | undefined {
		return [...this.tabs.values()].find((t) => t.panel.active)?.review;
	}

	private make(review: Review): { panel: Panel; review: Review } {
		const panel = this.deps.vscode.window.createWebviewPanel('dsnr.review', review.title, this.deps.vscode.ViewColumn.Active, {
			enableScripts: true,
		});
		const shown = { panel, review };
		this.tabs.set(review.projectId, shown);
		// The comments this tab has been shown or has made, by thread: the only ones its page may change.
		const seen = new Set<number>();
		panel.webview.onDidReceiveMessage(async (raw: unknown) => {
			const ask = readRelayAsk(raw);
			if (ask === null) return;
			this.deps.log?.info(`The review of ${shown.review.title} asked ${ask.name}.`);
			const result = await this.deps.answer(shown.review, ask.name, ask.args, seen, 'tab');
			await panel.webview.postMessage({ dsnr: 'answer', id: ask.id, result } satisfies RelayTell);
		});
		panel.onDidDispose(() => this.tabs.delete(review.projectId));
		return shown;
	}
}

/** A key as it is kept: its hash, so the key itself is never kept or compared. */
const hashOf = (key: string): string => createHash('sha256').update(key).digest('hex');

/**
 * Builds the site for reviews from the design repository's records, with the viewer the extension carries; its pages are
 * served from `pagesAt`, the pages' own address (the README's Review isolation), not beside their bar.
 */
export const buildReviewSite = (siteDir: string, viewerDir: string) => (records: string, pagesAt: string) => {
	mkdirSync(dirname(siteDir), { recursive: true });
	buildSite({
		designRoot: dirname(records),
		outDir: siteDir,
		comments: undefined,
		viewer: { dir: viewerDir, ref: DESIGN_REPO },
		pagesAt,
	});
};

/** Where the review site is served, under this machine's server, on both its addresses. */
export const REVIEW_KEY = 'review';

/** Where the extension keeps the site it builds for reviews. */
export const siteIn = (storage: string): string => join(storage, 'review-site');

/**
 * A prototype to review, chosen in VS Code's quick pick (the natural form for one of many): each project's prototypes,
 * newest first (`reviewsOf`), as the panel's rows open them. Said when there is none.
 */
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
