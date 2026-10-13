import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type * as VsCode from 'vscode';
import type { Route } from '../../src/main/handle';
import type { CommentRef, InvokeName, Result, SignInState } from '../../src/shared/contract';
import { DESIGN_REPO } from '../../src/shared/config';
import { escapeHtml } from '../../src/shared/html';
import { parsePrototypeName } from '../../src/shared/prototypeNames';
import { toResult } from '../../src/shared/result';
import { type RelayCall, type RelayTell, readRelayAsk } from '../../src/shared/reviewRelay';
import { buildSite } from '../../src/site/buildSite';
import { callRoute } from './bridge';
import { newNonce } from './html';
import type { Review } from './messages';

/** Where a prototype's review is on the site, as the site lays it out: `<project>/v<version>/i<iteration>/`. */
export const reviewPath = (projectId: string, name: string): string => {
	const parsed = parsePrototypeName(name);
	if (!parsed) throw new Error(`${name} is not a prototype, so it has no review page.`);
	return `${projectId}/v${parsed.version}/i${parsed.iteration}/`;
};

/**
 * The tab's page: only the review, framed from this machine, and its one script, which says hello to the page once it
 * has loaded (so the page knows DSNR frames it), passes what the page asks up to the extension and the answers back
 * down, to the page's own address and nothing else (`shared/reviewRelay`). Each side reads what it is sent.
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
window.addEventListener('message', (e) => {
	if (e.source === frame.contentWindow) {
		if (e.origin === page) vscode.postMessage(e.data);
	} else frame.contentWindow.postMessage(e.data, page);
});
</script>
</body>
</html>`;
};

/** How the extension answers a review page: the core's table, VS Code's sign-in, and Address. */
interface ReviewAnswers {
	routes: () => ReadonlyMap<InvokeName, Route>;
	signIn: () => Promise<SignInState>;
	address: (review: Review, comment: CommentRef) => Promise<unknown>;
	/** Told once a comment was written (made, moved, resolved, deleted, addressed), so what counts them is read again. */
	written: () => void;
}

const isRef = (v: unknown): v is CommentRef =>
	typeof v === 'object' && v !== null && Number.isSafeInteger((v as CommentRef).thread) && Number.isSafeInteger((v as CommentRef).id);

/**
 * What a review page asked (`RelayCall`), answered: a comment call by the core, as the app's window is answered, and only
 * on this review's project; signing in by VS Code; Address by the extension, on this review's prototype.
 */
export const answerReview = async (answers: ReviewAnswers, review: Review, name: RelayCall, args: unknown[]): Promise<Result<unknown>> => {
	const result = await answered(answers, review, name, args);
	if (result.ok && WRITES.has(name)) answers.written();
	return result;
};

/** The calls that change a comment, or what a comment says of itself (Address): after one, the counts are read again. */
const WRITES = new Set<RelayCall>(['postComment', 'moveComment', 'resolveComment', 'deleteComment', 'address']);

const answered = async (answers: ReviewAnswers, review: Review, name: RelayCall, args: unknown[]): Promise<Result<unknown>> => {
	if (name === 'signIn') return toResult(answers.signIn());
	if (name === 'address') {
		const [comment] = args;
		return args.length === 1 && isRef(comment) ? toResult(answers.address(review, comment)) : { ok: false, error: 'Address is given one comment.' };
	}
	if ((name === 'readComments' || name === 'postComment') && args[0] !== review.projectId)
		return { ok: false, error: `This review is of ${review.projectId}, so it comments only on ${review.projectId}.` };
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
			build: (records: string) => void;
			/** Serves the built site from this machine, and says its address. */
			serve: () => Promise<string>;
			answer: (review: Review, name: RelayCall, args: unknown[]) => Promise<Result<unknown>>;
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
		this.deps.build(records);
		return `${await this.deps.serve()}${path}`;
	}

	async open({ records, ...review }: Review & { records: string }): Promise<void> {
		const src = await this.address({ records, ...review });
		const open = this.tabs.get(review.projectId);
		const shown = open ?? this.make(review);
		shown.review = review;
		shown.panel.title = review.title;
		shown.panel.webview.html = reviewPage({ src, title: review.title, nonce: newNonce() });
		// A tab already open is brought forward; a new one opens in front.
		if (open) shown.panel.reveal();
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
		panel.webview.onDidReceiveMessage(async (raw: unknown) => {
			const ask = readRelayAsk(raw);
			if (ask === null) return;
			this.deps.log?.info(`The review of ${shown.review.title} asked ${ask.name}.`);
			const result = await this.deps.answer(shown.review, ask.name, ask.args);
			await panel.webview.postMessage({ dsnr: 'answer', id: ask.id, result } satisfies RelayTell);
		});
		panel.onDidDispose(() => this.tabs.delete(review.projectId));
		return shown;
	}
}

/** Builds the site for reviews from the design repository's records, with the viewer the extension carries. */
export const buildReviewSite = (siteDir: string, viewerDir: string) => (records: string) => {
	mkdirSync(dirname(siteDir), { recursive: true });
	buildSite({ designRoot: dirname(records), outDir: siteDir, comments: undefined, viewer: { dir: viewerDir, ref: DESIGN_REPO } });
};

/** Where the extension keeps the site it builds for reviews. */
export const siteIn = (storage: string): string => join(storage, 'review-site');
