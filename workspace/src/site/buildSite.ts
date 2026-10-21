import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Work } from '../shared/contract';
import { escapeHtml, firstInHead } from '../shared/html';
import { fromBrief } from '../shared/brief';
import { SHARED_DIR, SHARED_REF, sitePath } from '../shared/designPaths';
import { newestVersionFirst } from '../shared/prototypeNames';
import { workLabel } from '../shared/work';
import { statesOf } from '../shared/prototypeStates';
import { workInFolder } from '../core/services/projects/workRecords';
import { contentHashOf } from '../core/services/prototypes/prototype';
import { plural } from '../shared/plural';
import { extensionOf } from '../shared/mime';
import type { RepoRef } from '../shared/repoRef';
import { SIGN_IN_AUTHORIZE_URL, pagesSiteUrl } from '../shared/hostUrls';
import type { SignInConfig } from '../shared/signInConfig';
import { FONT, INK, OPACITY, RADIUS, SIZE, WEIGHT, px, space } from '../shared/pageTokens';

/**
 * Rebuilt in full every time, so two publishers never overwrite each other and what is gone there is gone here. Every
 * link is relative, as GitHub Pages serves a site under the repository's name.
 */
export interface SiteInput {
	designRoot: string;
	/** Cleared first, but only if it is a site this made, or empty. */
	outDir: string;
	/** The built viewer and the repository whose review threads it shows. Without it a page has nothing to comment with. */
	viewer?: { dir: string; ref: RepoRef };
	/**
	 * The pages' root on their own origin, ending in `/`, so each page is another origin than the bar (the README's Review
	 * isolation). Without it, as on the published site, each page is beside its bar.
	 */
	pagesAt?: string;
	/** `exchange` is the sign-in function's address. An empty client ID is no sign-in. */
	signIn?: { clientId: string; exchange: string };
}

/** For a page on another origin than its bar (VS Code). */
export const SANDBOX_APART = 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals';
/**
 * For a page beside its bar (the published site): **no origin of its own**, or it would be the bar's, and it could take
 * the sandbox off and read the bar's storage, where the person's token is. The page agent gives it storage stand-ins.
 */
export const SANDBOX_BESIDE = 'allow-scripts allow-forms allow-popups allow-modals';

export interface SiteSummary {
	projects: { id: string; title: string; pages: number }[];
}

/** Left in a folder this wrote, so it is only ever this that clears it. */
const MARK = '.flock-designer-site';

interface Page {
	record: Work;
	/** From its project's folder: `v2/`. */
	path: string;
}
interface SiteProject {
	id: string;
	title: string;
	/** Newest first. */
	versions: Page[];
}

const labelOf = (p: Page): string => workLabel(p.record);
const dateOf = (iso: string | undefined): string | null => {
	const d = iso ? new Date(iso) : null;
	return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null;
};

const readProjects = (designRoot: string): SiteProject[] => {
	const projectsDir = join(designRoot, 'projects');
	const ids = existsSync(projectsDir)
		? readdirSync(projectsDir, { withFileTypes: true })
				.filter((e) => e.isDirectory() && !e.name.startsWith('_'))
				.map((e) => e.name)
				.sort()
		: [];
	return ids.flatMap((id): SiteProject[] => {
		const dir = join(projectsDir, id);
		// A project whose records cannot be read has nothing to show; the rest of the site is still built.
		const records = workInFolder(dir);
		if (records === null) return [];
		const pages = records.flatMap((record): Page[] => {
			const at = sitePath(id, record.name);
			const saved = existsSync(join(dir, 'prototypes', `${record.name}.html`));
			return at && saved ? [{ record, path: at.slice(id.length + 1) }] : [];
		});
		if (pages.length === 0) return [];
		const brief = existsSync(join(dir, 'brief.md')) ? readFileSync(join(dir, 'brief.md'), 'utf8') : '';
		return [
			{
				id,
				title: fromBrief(id, brief).title,
				versions: pages.sort((a, b) => newestVersionFirst(a.record.name, b.record.name)),
			},
		];
	});
};

const writeShared = (designRoot: string, outDir: string): Map<string, string> => {
	const names = new Map<string, string>();
	const dir = join(designRoot, SHARED_DIR);
	if (!existsSync(dir)) return names;
	for (const f of readdirSync(dir)) {
		const hash = /^([0-9a-f]{16})\.datauri$/.exec(f)?.[1];
		const m = hash ? /^data:([^;,]+)(;base64)?,(.*)$/s.exec(readFileSync(join(dir, f), 'utf8')) : null;
		if (!hash || !m) continue;
		const name = `${hash}.${extensionOf(m[1] as string) ?? 'bin'}`;
		const body = m[2] ? Buffer.from(m[3] as string, 'base64') : Buffer.from(decodeURIComponent(m[3] as string));
		mkdirSync(join(outDir, '_shared'), { recursive: true });
		writeFileSync(join(outDir, '_shared', name), body);
		names.set(hash, name);
	}
	return names;
};

const STYLE = `
:root { color-scheme: light dark; font-family: ${FONT.ui}; }
body { margin: 0; }
a { color: ${INK.link}; }
main { max-width: 1080px; margin: 0 auto; padding: ${space(8)} ${space(7)}; }
/* The lists' own headings, in their <main>: never a bare heading, which would also size the review bar's title. */
main h1 { font-size: ${px(SIZE.title)}; font-weight: ${WEIGHT.semibold}; margin: 0 0 ${space(7)}; }
.muted { opacity: ${OPACITY.receded}; font-size: ${px(SIZE.body)}; }
.list { list-style: none; padding: 0; margin: 0; display: grid; gap: ${space(4)}; }
.list a { display: block; padding: ${space(5)} ${space(6)}; border: 1px solid ${INK.line}; border-radius: ${px(RADIUS.large)}; text-decoration: none; }
.list a:hover { border-color: ${INK.lineStrong}; }
.list .muted { color: CanvasText; }
/* A version fills the window: DSNR's review bar, then the prototype, and beside it the comments' panel when it is open. */
.viewer { display: flex; flex-direction: column; height: 100vh; height: 100dvh; }
.stage { display: flex; flex: 1; min-height: 0; }
.stage iframe { display: block; flex: 1; min-width: 0; height: 100%; border: 0; }
#dsnr-panel:empty { display: none; }
/* A prototype is made for a computer's screen: on a phone it keeps that width, to scroll across, and says so. */
.small-screen { display: none; margin: 0; padding: ${space(3)} ${space(6)}; font-size: ${px(SIZE.body)}; border-bottom: 1px solid ${INK.line}; }
@media (max-width: 767px) {
	.small-screen { display: block; }
	.stage { overflow-x: auto; }
	.stage iframe { min-width: 1024px; }
}
`;

const shell = (title: string, body: string, head = ''): string =>
	`<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escapeHtml(title)}</title>\n${head}<style>${STYLE}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

const redirect = (title: string, to: string): string =>
	shell(title, `<main><p><a href="${to}">${escapeHtml(title)}</a></p></main>`, `<meta http-equiv="refresh" content="0; url=${to}">\n`);

/** No `<` in it can close the element. */
const jsonScript = (id: string, value: unknown): string =>
	`<script type="application/json" id="${id}">${JSON.stringify(value).replace(/</g, '\\u003c')}</script>\n`;

const signInScript = (viewer: SiteInput['viewer'], signIn: SiteInput['signIn']): string => {
	if (!viewer || !signIn?.clientId) return '';
	const config: SignInConfig = {
		clientId: signIn.clientId,
		exchange: signIn.exchange,
		redirect: pagesSiteUrl(viewer.ref),
		authorize: SIGN_IN_AUTHORIZE_URL,
	};
	return jsonScript('dsnr-sign-in', config);
};

const indexPage = (projects: SiteProject[], head = ''): string =>
	shell(
		'Prototypes',
		`<main>\n<h1>Prototypes</h1>\n<ul class="list">\n${projects
			.map((p) => {
				const n = p.versions.length;
				const updated = dateOf(
					p.versions
						.map((pg) => pg.record.createdAt ?? '')
						.sort()
						.at(-1),
				);
				return `<li><a href="${p.id}/${(p.versions[0] as Page).path}"><strong>${escapeHtml(p.title)}</strong><br><span class="muted">${plural(n, 'version')}${updated ? ` · ${updated}` : ''}</span></a></li>`;
			})
			.join('\n')}\n</ul>\n</main>`,
		head,
	);

/** `page` is the page's fingerprint, which a comment placed on it carries. */
const viewerConfig = (ref: RepoRef, p: SiteProject, current: Page, states: string[], page: string): string =>
	jsonScript('dsnr-config', {
		owner: ref.owner,
		repo: ref.repo,
		projectId: p.id,
		name: current.record.name,
		title: p.title,
		projectHref: '../',
		prototypesHref: '../../',
		versions: p.versions.map((pg) => ({ name: pg.record.name, href: `../${pg.path}`, ...(pg.record.from ? { from: pg.record.from } : {}) })),
		states,
		page,
	});

const frameAt = (p: SiteProject, page: Page, pagesAt: string | undefined): string =>
	pagesAt
		? `src="${escapeHtml(`${pagesAt}${p.id}/${page.path}page.html`)}" sandbox="${SANDBOX_APART}"`
		: `src="page.html" sandbox="${SANDBOX_BESIDE}"`;

/**
 * The page is in a frame, so its own styles never reach the bar. Until the viewer takes the bar over, and where it never
 * does, the bar is a link back to all the prototypes.
 */
const viewerPage = (
	p: SiteProject,
	current: Page,
	viewer: SiteInput['viewer'],
	states: string[],
	page: string,
	pagesAt: string | undefined,
	signIn: string,
): string => {
	const head = viewer
		? `${signIn}<link rel="stylesheet" href="../../_viewer/viewer.css">\n${viewerConfig(viewer.ref, p, current, states, page)}<script type="module" src="../../_viewer/viewer.js"></script>\n`
		: '';
	return shell(
		`${p.title} · ${labelOf(current)}`,
		`<div class="viewer">\n<header id="dsnr-bar"><a href="../../">All prototypes</a></header>\n<p class="small-screen">Best on a computer: this prototype is made for a wider screen. Scroll across to see all of it.</p>\n<div class="stage">\n<iframe id="dsnr-frame" ${frameAt(p, current, pagesAt)} title="${escapeHtml(`${p.title}, ${labelOf(current)}`)}"></iframe>\n<aside id="dsnr-panel"></aside>\n</div>\n</div>`,
		head,
	);
};

export const PAGE_AGENT = 'page-agent.js';

const clearOut = (outDir: string): void => {
	if (existsSync(outDir) && readdirSync(outDir).length > 0) {
		if (!existsSync(join(outDir, MARK))) throw new Error(`${outDir} is not a site DSNR built, so it is left alone. Choose an empty folder.`);
		rmSync(outDir, { recursive: true, force: true });
	}
	mkdirSync(outDir, { recursive: true });
	writeFileSync(join(outDir, MARK), 'Built by DSNR. This folder is cleared and rebuilt each time.\n');
};

export const buildSite = ({ designRoot, outDir, viewer, pagesAt, signIn: signingIn }: SiteInput): SiteSummary => {
	const projects = readProjects(designRoot);
	clearOut(outDir);
	const shared = writeShared(designRoot, outDir);
	if (viewer) {
		mkdirSync(join(outDir, '_viewer'), { recursive: true });
		// Its icons' font, which its stylesheet names, and the page agent, which every page carries so the bar can ask it for
		// the page's pins. A viewer missing any of them is out of date.
		for (const f of ['viewer.js', 'viewer.css', 'viewer.ttf', PAGE_AGENT]) {
			if (!existsSync(join(viewer.dir, f))) throw new Error(`The viewer at ${viewer.dir} has no ${f}: build it again.`);
			copyFileSync(join(viewer.dir, f), join(outDir, '_viewer', f));
		}
	}
	// A page sits two folders down (<project>/v2/), and finds the shared files from there.
	const relink = (html: string): string =>
		withAgent(html.replace(SHARED_REF, (whole, hash: string) => (shared.has(hash) ? `../../_shared/${shared.get(hash)}` : whole)));
	/** First in the head, before the prototype's own code, so the bar asks it for the pins rather than reaching into the page. */
	const withAgent = (html: string): string => {
		if (!viewer) return html;
		return firstInHead(html, `<script src="../../_viewer/${PAGE_AGENT}"></script>`);
	};

	const signIn = signInScript(viewer, signingIn);
	// The front page is where GitHub sends a person back after signing in: it carries the viewer to finish it.
	writeFileSync(join(outDir, 'index.html'), indexPage(projects, signIn ? `${signIn}<script type="module" src="_viewer/viewer.js"></script>\n` : ''));
	for (const p of projects) {
		const dir = join(outDir, p.id);
		mkdirSync(dir, { recursive: true });
		for (const pg of p.versions) {
			const at = join(dir, pg.path);
			mkdirSync(at, { recursive: true });
			const html = readFileSync(join(designRoot, 'projects', p.id, 'prototypes', `${pg.record.name}.html`), 'utf8');
			writeFileSync(join(at, 'index.html'), viewerPage(p, pg, viewer, statesOf(html), contentHashOf(html), pagesAt, signIn));
			writeFileSync(join(at, 'page.html'), relink(html));
		}
		// A project has no page of its own, so its address, which a link may have, and `latest/` both lead to its newest version.
		const newest = p.versions[0] as Page;
		mkdirSync(join(dir, 'latest'), { recursive: true });
		writeFileSync(join(dir, 'index.html'), redirect(`${p.title} · ${labelOf(newest)}`, newest.path));
		writeFileSync(join(dir, 'latest', 'index.html'), redirect(`${p.title} · ${labelOf(newest)}`, `../${newest.path}`));
	}
	return { projects: projects.map((p) => ({ id: p.id, title: p.title, pages: p.versions.length })) };
};
