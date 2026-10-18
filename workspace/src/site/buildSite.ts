import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Work } from '../shared/contract';
import { escapeHtml, firstInHead } from '../shared/html';
import { fromBrief } from '../shared/brief';
import { SHARED_DIR, SHARED_REF, isPrototypeKey, sitePath } from '../shared/designPaths';
import { newestVersionFirst } from '../shared/prototypeNames';
import { workLabel, projectCodeLink } from '../shared/work';
import { statesOf } from '../shared/prototypeStates';
import { workInFolder } from '../main/services/workRecords';
import { contentHashOf } from '../main/services/prototype';
import { plural } from '../shared/plural';
import { extensionOf } from '../shared/mime';
import type { RepoRef } from '../shared/repoRef';
import { SIGN_IN_AUTHORIZE_URL, pagesSiteUrl } from '../shared/hostUrls';
import type { SignInConfig } from '../shared/signInConfig';

/**
 * The site prototypes are published as, built from the design repository: every project with a saved page, every
 * version of it, and an index, at addresses that follow the project's structure.
 *
 * ```text
 * /                    the projects
 * /<project>/          its versions, the newest first
 * /<project>/v2/       one version: its page, under a bar that names the project and switches between them
 * /<project>/latest/   the newest version
 * ```
 *
 * **Built from the repository, in full, every time,** so two people publishing never overwrite each other's pages, and
 * what is gone from the repository is gone from the site. Every link is relative, so it works wherever it is served
 * (GitHub Pages puts a project's site under its name). Nothing of the app is in it.
 */
export interface SiteInput {
	/** The design repository: its `projects/` folder is what is published. */
	designRoot: string;
	/** Where the site is written. Cleared first, but only if it is a site this made, or empty. */
	outDir: string;
	/** How many comments each version has, by its key (`prototype/<project>/<name>`), when they could be read. */
	comments?: Map<string, number>;
	/**
	 * Comments on each version's page: the built viewer (`viewer.js`, `viewer.css`), and the repository whose review
	 * threads they are. Without it the pages are as they were, with nothing to comment with.
	 */
	viewer?: { dir: string; ref: RepoRef };
	/**
	 * Where the site's pages are served when that is not beside the bar (the README's Review isolation): the address its root
	 * is at on the pages' own origin, ending in `/`. The bar's frame then loads each page from there, sandboxed, so the page
	 * is another origin than the bar. Without it, as on the published site, each page is beside its bar.
	 */
	pagesAt?: string;
	/**
	 * Signing in to comment (PUBLISHED_COMMENTS_PLAN, Phase 3): the GitHub App's client ID and the sign-in function's address.
	 * With it and a viewer, every page carries what the viewer needs to sign a person in, and the site's front page, which
	 * GitHub sends a person back to, finishes it. An empty client ID is none.
	 */
	signIn?: { clientId: string; exchange: string };
}

/** A page on another origin than its bar (VS Code): its own scripts, origin (cookies, storage), forms, pop-ups and alerts; never the window above. */
export const SANDBOX_APART = 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals';
/**
 * A page beside its bar (the published site): the same, but **no origin of its own**. On the bar's address its own origin
 * would be the bar's, and it could take the sandbox off through the bar and read the bar's storage, where the person's token
 * is (PUBLISHED_COMMENTS_PLAN, 2.2). The browser then refuses its storage and cookies; the page agent gives it stand-ins.
 */
export const SANDBOX_BESIDE = 'allow-scripts allow-forms allow-popups allow-modals';

export interface SiteSummary {
	projects: { id: string; title: string; pages: number }[];
}

/** Left in a folder this wrote, so it is only ever this that clears it. */
const MARK = '.flock-designer-site';

interface Page {
	record: Work;
	/** Where it is from its project's folder: `v2/`. */
	path: string;
}
interface SiteProject {
	id: string;
	title: string;
	/** Newest version first. */
	versions: Page[];
	/** Where its codebase work is on GitHub (`codeLink`): its pull request, else its branch. */
	builtInCode: string | null;
}

const labelOf = (p: Page): string => workLabel(p.record);
const dateOf = (iso: string | undefined): string | null => {
	const d = iso ? new Date(iso) : null;
	return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : null;
};

/** Every project with at least one saved page, from the repository as it is. */
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
			return at && isPrototypeKey(record.branch) && saved ? [{ record, path: at.slice(id.length + 1) }] : [];
		});
		if (pages.length === 0) return [];
		const brief = existsSync(join(dir, 'brief.md')) ? readFileSync(join(dir, 'brief.md'), 'utf8') : '';
		return [
			{
				id,
				title: fromBrief(id, brief).title,
				versions: pages.sort((a, b) => newestVersionFirst(a.record.name, b.record.name)),
				builtInCode: projectCodeLink({ work: records }),
			},
		];
	});
};

/** The design system's large files, written as the files they are, by name. */
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
:root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
body { margin: 0; }
a { color: inherit; }
main { max-width: 1080px; margin: 0 auto; padding: 32px 24px; }
/* The lists' own headings, in their <main>: never a bare heading, which would also size the review bar's title. */
main h1 { font-size: 22px; font-weight: 600; margin: 0 0 20px; }
.muted { opacity: 0.65; font-size: 13px; }
.list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.list a { display: block; padding: 12px 14px; border: 1px solid #8884; border-radius: 8px; text-decoration: none; }
.list a:hover { border-color: #888c; }
/* A version fills the window: the app's own toolbar, then the prototype, and beside it the comments' panel when it is open. */
.viewer { display: flex; flex-direction: column; height: 100vh; height: 100dvh; }
.stage { display: flex; flex: 1; min-height: 0; }
.stage iframe { display: block; flex: 1; min-width: 0; height: 100%; border: 0; }
#dsnr-panel:empty { display: none; }
/* A prototype is made for a computer's screen: on a phone it keeps that width, to scroll across, and says so. */
.small-screen { display: none; margin: 0; padding: 6px 16px; font-size: 13px; border-bottom: 1px solid #8884; }
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

/** What a page is told, as JSON in a script element of its own, safe there: no `<` in it can close the element. */
const jsonScript = (id: string, value: unknown): string =>
	`<script type="application/json" id="${id}">${JSON.stringify(value).replace(/</g, '\\u003c')}</script>\n`;

/**
 * What a page is told about signing in: the App, the function, GitHub's sign-in page, and the site's own address, which
 * GitHub sends the person back to. Nothing when there is no viewer or no sign-in.
 */
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
				const newest = dateOf(
					p.versions
						.map((pg) => pg.record.createdAt ?? '')
						.sort()
						.at(-1),
				);
				return `<li><a href="${p.id}/"><strong>${escapeHtml(p.title)}</strong><br><span class="muted">${plural(n, 'version')}${newest ? ` · ${newest}` : ''}</span></a></li>`;
			})
			.join('\n')}\n</ul>\n</main>`,
		head,
	);

const projectPage = (p: SiteProject, comments: Map<string, number> | undefined): string =>
	shell(
		p.title,
		`<main>\n<p class="muted"><a href="../">All prototypes</a></p>\n<h1>${escapeHtml(p.title)}</h1>\n${p.builtInCode ? `<p><a href="${escapeHtml(p.builtInCode)}">Built in code</a></p>\n` : ''}<ul class="list">\n${p.versions
			.map((pg) => {
				const date = dateOf(pg.record.createdAt);
				const author = pg.record.contributors?.[0]?.name;
				const count = comments?.get(pg.record.branch);
				const facts = [date, author, count === undefined ? null : plural(count, 'comment')].filter(Boolean);
				return `<li><a href="${pg.path}"><strong>${labelOf(pg)}</strong>${facts.length ? `<br><span class="muted">${facts.map((f) => escapeHtml(String(f))).join(' · ')}</span>` : ''}</a></li>`;
			})
			.join('\n')}\n</ul>\n</main>`,
	);

/**
 * What the page's bar and comments are told: which version this is, where the others are, the states the page has, and its
 * fingerprint, which a comment placed on it carries.
 */
const viewerConfig = (ref: RepoRef, p: SiteProject, current: Page, states: string[], page: string): string =>
	jsonScript('dsnr-config', {
		owner: ref.owner,
		repo: ref.repo,
		projectId: p.id,
		name: current.record.name,
		title: p.title,
		projectHref: '../',
		versions: p.versions.map((pg) => ({ name: pg.record.name, href: `../${pg.path}` })),
		states,
		page,
	});

/** Where the bar's frame loads its page, sandboxed either way: from the pages' address with its own origin, or beside it with none. */
const frameAt = (p: SiteProject, page: Page, pagesAt: string | undefined): string =>
	pagesAt
		? `src="${escapeHtml(`${pagesAt}${p.id}/${page.path}page.html`)}" sandbox="${SANDBOX_APART}"`
		: `src="page.html" sandbox="${SANDBOX_BESIDE}"`;

/**
 * One version: its page in a frame, so the page's own styles never reach the bar, under the bar. The bar is the
 * app's own, drawn by the viewer (the switcher, comments); until it takes over, and where it never does, the bar is a
 * link back to the project, and nothing about it is styled here.
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
		`<div class="viewer">\n<header id="dsnr-bar"><a href="../">${escapeHtml(p.title)}</a></header>\n<p class="small-screen">Best on a computer: this prototype is made for a wider screen. Scroll across to see all of it.</p>\n<div class="stage">\n<iframe id="dsnr-frame" ${frameAt(p, current, pagesAt)} title="${escapeHtml(`${p.title}, ${labelOf(current)}`)}"></iframe>\n<aside id="dsnr-panel"></aside>\n</div>\n</div>`,
		head,
	);
};

/** The page agent's file, built with the viewer and copied beside it. */
const PAGE_AGENT = 'page-agent.js';

/** Clears `outDir` for a fresh build, refusing anything that is not a site this wrote, or empty. */
const clearOut = (outDir: string): void => {
	if (existsSync(outDir) && readdirSync(outDir).length > 0) {
		if (!existsSync(join(outDir, MARK))) throw new Error(`${outDir} is not a site DSNR built, so it is left alone. Choose an empty folder.`);
		rmSync(outDir, { recursive: true, force: true });
	}
	mkdirSync(outDir, { recursive: true });
	writeFileSync(join(outDir, MARK), 'Built by DSNR. This folder is cleared and rebuilt each time.\n');
};

export const buildSite = ({ designRoot, outDir, comments, viewer, pagesAt, signIn: signingIn }: SiteInput): SiteSummary => {
	const projects = readProjects(designRoot);
	clearOut(outDir);
	const shared = writeShared(designRoot, outDir);
	if (viewer) {
		mkdirSync(join(outDir, '_viewer'), { recursive: true });
		// The page agent with them: every prototype's page carries it, so the bar asks it for the page's pins.
		for (const f of ['viewer.js', 'viewer.css', PAGE_AGENT]) {
			if (!existsSync(join(viewer.dir, f)))
				throw new Error(`The viewer at ${viewer.dir} has no ${f}: build it again (its pages would have no pins).`);
			copyFileSync(join(viewer.dir, f), join(outDir, '_viewer', f));
		}
	}
	// A page sits two folders down (<project>/v2/), and finds the shared files from there.
	const relink = (html: string): string =>
		withAgent(html.replace(SHARED_REF, (whole, hash: string) => (shared.has(hash) ? `../../_shared/${shared.get(hash)}` : whole)));
	/**
	 * With the viewer, the page agent first in the page's head (the README's Review isolation), before the prototype's own code,
	 * so the review bar asks it for the page's pins rather than reaching into the page.
	 */
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
		writeFileSync(join(dir, 'index.html'), projectPage(p, comments));
		for (const pg of p.versions) {
			const at = join(dir, pg.path);
			mkdirSync(at, { recursive: true });
			const html = readFileSync(join(designRoot, 'projects', p.id, 'prototypes', `${pg.record.name}.html`), 'utf8');
			writeFileSync(join(at, 'index.html'), viewerPage(p, pg, viewer, statesOf(html), contentHashOf(html), pagesAt, signIn));
			writeFileSync(join(at, 'page.html'), relink(html));
		}
		const newest = p.versions[0] as Page;
		mkdirSync(join(dir, 'latest'), { recursive: true });
		writeFileSync(join(dir, 'latest', 'index.html'), redirect(`${p.title} · ${labelOf(newest)}`, `../${newest.path}`));
	}
	return { projects: projects.map((p) => ({ id: p.id, title: p.title, pages: p.versions.length })) };
};
