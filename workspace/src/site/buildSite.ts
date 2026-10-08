import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Iteration } from '../shared/contract';
import { firstHeading, isPrototypeKey, parsePrototypeName } from '../shared/projects';

/**
 * The site prototypes are published as, built from the design repository: every project with a saved page, every
 * version and iteration of it, and an index, at addresses that follow the project's structure.
 *
 * ```text
 * /                       the projects
 * /<project>/             its versions side by side, each with its iterations
 * /<project>/v1/i2/       one iteration: its page, under a bar that names the project and switches between them
 * /<project>/v1/latest/   the newest iteration of version 1
 * /<project>/latest/      the newest version's newest iteration
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
	/** How many comments each iteration has, by its key (`prototype/<project>/<name>`), when they could be read. */
	comments?: Map<string, number>;
}

export interface SiteSummary {
	projects: { id: string; title: string; pages: number }[];
}

/** Left in a folder this wrote, so it is only ever this that clears it. */
const MARK = '.flock-designer-site';

interface Page {
	record: Iteration;
	version: number;
	iteration: number;
}
interface SiteProject {
	id: string;
	title: string;
	/** Oldest version first; each version's iterations newest first. */
	versions: { version: number; pages: Page[] }[];
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Text as it is safe in HTML, in an element or an attribute. */
const escape = (s: string): string => s.replace(/[&<>"']/g, (c) => ENTITIES[c] as string);
const pathOf = (p: Page): string => `v${p.version}/i${p.iteration}/`;
const labelOf = (p: Page): string => `V${p.version} · I${p.iteration}`;
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
		let records: Iteration[] = [];
		try {
			const parsed = JSON.parse(readFileSync(join(dir, 'iterations.json'), 'utf8')) as unknown;
			records = Array.isArray(parsed) ? (parsed as Iteration[]) : [];
		} catch {
			return [];
		}
		const pages = records.flatMap((record): Page[] => {
			const name = parsePrototypeName(record.name);
			const saved = existsSync(join(dir, 'prototypes', `${record.name}.html`));
			return name && isPrototypeKey(record.branch) && saved ? [{ record, version: name.version, iteration: name.iteration }] : [];
		});
		if (pages.length === 0) return [];
		const byVersion = new Map<number, Page[]>();
		for (const p of pages) byVersion.set(p.version, [...(byVersion.get(p.version) ?? []), p]);
		const brief = existsSync(join(dir, 'brief.md')) ? readFileSync(join(dir, 'brief.md'), 'utf8') : '';
		return [
			{
				id,
				title: firstHeading(brief) ?? id,
				versions: [...byVersion.entries()]
					.sort(([a], [b]) => a - b)
					.map(([version, ps]) => ({ version, pages: ps.sort((a, b) => b.iteration - a.iteration) })),
			},
		];
	});
};

/** The design system's large files, written as the files they are, by name. */
const writeShared = (designRoot: string, outDir: string): Map<string, string> => {
	const names = new Map<string, string>();
	const dir = join(designRoot, 'projects', '_shared');
	if (!existsSync(dir)) return names;
	const ext: Record<string, string> = { 'font/woff2': 'woff2', 'font/woff': 'woff', 'font/ttf': 'ttf', 'font/otf': 'otf', 'image/svg+xml': 'svg', 'image/png': 'png' };
	for (const f of readdirSync(dir)) {
		const hash = /^([0-9a-f]{16})\.datauri$/.exec(f)?.[1];
		const m = hash ? /^data:([^;,]+)(;base64)?,(.*)$/s.exec(readFileSync(join(dir, f), 'utf8')) : null;
		if (!hash || !m) continue;
		const name = `${hash}.${ext[m[1] as string] ?? 'bin'}`;
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
h1 { font-size: 22px; font-weight: 600; margin: 0 0 20px; }
.muted { opacity: 0.65; font-size: 13px; }
.list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
.list a { display: block; padding: 12px 14px; border: 1px solid #8884; border-radius: 8px; text-decoration: none; }
.list a:hover { border-color: #888c; }
.versions { display: flex; gap: 16px; align-items: flex-start; overflow-x: auto; }
.version { min-width: 220px; flex: 0 0 auto; }
.version h2 { font-size: 15px; font-weight: 600; margin: 0 0 8px; }
.bar { display: flex; align-items: center; gap: 12px; height: 44px; padding: 0 12px; border-bottom: 1px solid #8884; font-size: 14px; box-sizing: border-box; }
.bar .grow { flex: 1; }
.bar select { font: inherit; padding: 4px 6px; }
iframe { display: block; width: 100%; height: calc(100vh - 44px); border: 0; }
`;

const shell = (title: string, body: string, head = ''): string =>
	`<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${escape(title)}</title>\n${head}<style>${STYLE}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;

const redirect = (title: string, to: string): string =>
	shell(title, `<main><p><a href="${to}">${escape(title)}</a></p></main>`, `<meta http-equiv="refresh" content="0; url=${to}">\n`);

const indexPage = (projects: SiteProject[]): string =>
	shell(
		'Prototypes',
		`<main>\n<h1>Prototypes</h1>\n<ul class="list">\n${projects
			.map((p) => {
				const n = p.versions.length;
				const newest = dateOf(
					p.versions
						.flatMap((v) => v.pages.map((pg) => pg.record.createdAt ?? ''))
						.sort()
						.at(-1),
				);
				return `<li><a href="${p.id}/"><strong>${escape(p.title)}</strong><br><span class="muted">${n} ${n === 1 ? 'version' : 'versions'}${newest ? ` · ${newest}` : ''}</span></a></li>`;
			})
			.join('\n')}\n</ul>\n</main>`,
	);

const projectPage = (p: SiteProject, comments: Map<string, number> | undefined): string =>
	shell(
		p.title,
		`<main>\n<p class="muted"><a href="../">All prototypes</a></p>\n<h1>${escape(p.title)}</h1>\n<div class="versions">\n${p.versions
			.map(
				(v) =>
					`<section class="version">\n<h2>V${v.version}</h2>\n<ul class="list">\n${v.pages
						.map((pg) => {
							const date = dateOf(pg.record.createdAt);
							const author = pg.record.contributors?.[0]?.name;
							const count = comments?.get(pg.record.branch);
							const facts = [date, author, count === undefined ? null : `${count} ${count === 1 ? 'comment' : 'comments'}`].filter(Boolean);
							return `<li><a href="${pathOf(pg)}"><strong>I${pg.iteration}</strong>${facts.length ? `<br><span class="muted">${facts.map((f) => escape(String(f))).join(' · ')}</span>` : ''}</a></li>`;
						})
						.join('\n')}\n</ul>\n</section>`,
			)
			.join('\n')}\n</div>\n</main>`,
	);

/** One iteration: its page in a frame, so the page's own styles never reach the bar, under the bar. */
const viewerPage = (p: SiteProject, current: Page): string => {
	const options = p.versions
		.map(
			(v) =>
				`<optgroup label="V${v.version}">${v.pages
					.map((pg) => `<option value="../../${pathOf(pg)}"${pg === current ? ' selected' : ''}>V${pg.version} · I${pg.iteration}</option>`)
					.join('')}</optgroup>`,
		)
		.join('');
	return shell(
		`${p.title} · ${labelOf(current)}`,
		`<header class="bar">\n<a href="../../">${escape(p.title)}</a>\n<span class="grow"></span>\n<select aria-label="Version and iteration" onchange="location.href=this.value">${options}</select>\n</header>\n<iframe src="page.html" title="${escape(`${p.title}, ${labelOf(current)}`)}"></iframe>`,
	);
};

/** Clears `outDir` for a fresh build, refusing anything that is not a site this wrote, or empty. */
const clearOut = (outDir: string): void => {
	if (existsSync(outDir) && readdirSync(outDir).length > 0) {
		if (!existsSync(join(outDir, MARK))) throw new Error(`${outDir} is not a site Flock Designer built, so it is left alone. Choose an empty folder.`);
		rmSync(outDir, { recursive: true, force: true });
	}
	mkdirSync(outDir, { recursive: true });
	writeFileSync(join(outDir, MARK), 'Built by Flock Designer. This folder is cleared and rebuilt each time.\n');
};

export const buildSite = ({ designRoot, outDir, comments }: SiteInput): SiteSummary => {
	const projects = readProjects(designRoot);
	clearOut(outDir);
	const shared = writeShared(designRoot, outDir);
	// A page sits three folders down (<project>/v1/i2/), and finds the shared files from there.
	const relink = (html: string): string =>
		html.replace(/\/_shared\/([0-9a-f]{16})\b/g, (whole, hash: string) => (shared.has(hash) ? `../../../_shared/${shared.get(hash)}` : whole));

	writeFileSync(join(outDir, 'index.html'), indexPage(projects));
	for (const p of projects) {
		const dir = join(outDir, p.id);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, 'index.html'), projectPage(p, comments));
		for (const v of p.versions) {
			for (const pg of v.pages) {
				const at = join(dir, `v${pg.version}`, `i${pg.iteration}`);
				mkdirSync(at, { recursive: true });
				writeFileSync(join(at, 'index.html'), viewerPage(p, pg));
				writeFileSync(join(at, 'page.html'), relink(readFileSync(join(designRoot, 'projects', p.id, 'prototypes', `${pg.record.name}.html`), 'utf8')));
			}
			const newest = v.pages[0] as Page;
			mkdirSync(join(dir, `v${v.version}`, 'latest'), { recursive: true });
			writeFileSync(join(dir, `v${v.version}`, 'latest', 'index.html'), redirect(`${p.title} · ${labelOf(newest)}`, `../i${newest.iteration}/`));
		}
		const newestVersion = p.versions.at(-1) as SiteProject['versions'][number];
		const newest = newestVersion.pages[0] as Page;
		mkdirSync(join(dir, 'latest'), { recursive: true });
		writeFileSync(join(dir, 'latest', 'index.html'), redirect(`${p.title} · ${labelOf(newest)}`, `../${pathOf(newest)}`));
	}
	return { projects: projects.map((p) => ({ id: p.id, title: p.title, pages: p.versions.reduce((n, v) => n + v.pages.length, 0) })) };
};
