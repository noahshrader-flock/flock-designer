import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INK } from '../src/shared/pageTokens';
import { buildSite } from '../src/site/buildSite';
import { serveSite } from '../src/site/serveSite';
import { contentHashOf } from '../src/core/services/prototypes/prototype';

let root: string;
let design: string;
let out: string;

const FONT = Buffer.from('not really a font, but bytes all the same');
const HASH = '0123456789abcdef';
const page = (text: string) =>
	`<!doctype html><html><head><style>@font-face{src:url(/_shared/${HASH})}</style></head><body><h1>${text}</h1></body></html>`;
const record = (name: string, more: Record<string, unknown> = {}) => ({
	projectId: 'x',
	name,
	branch: `prototype/x/${name}`,
	commit: null,
	note: '',
	...more,
});
const project = (id: string, brief: string | null, work: Record<string, unknown>[], pages: Record<string, string>) => {
	const dir = join(design, 'prototypes', id);
	mkdirSync(dir, { recursive: true });
	if (brief !== null) writeFileSync(join(dir, 'brief.md'), brief);
	writeFileSync(
		join(dir, 'work.json'),
		JSON.stringify(work.map((i) => ({ ...i, projectId: id, branch: String(i.branch).replace('/x/', `/${id}/`) }))),
	);
	for (const [name, html] of Object.entries(pages)) writeFileSync(join(dir, `${name}.html`), html);
};
const read = (path: string) => readFileSync(join(out, path), 'utf8');
const build = (more: Partial<Parameters<typeof buildSite>[0]> = {}) => buildSite({ designRoot: design, outDir: out, ...more });

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'fdw-site-'));
	design = join(root, 'flock-designer');
	out = join(root, 'site');
	mkdirSync(join(design, 'prototypes', '_shared'), { recursive: true });
	writeFileSync(join(design, 'prototypes', '_shared', `${HASH}.datauri`), `data:font/woff2;base64,${FONT.toString('base64')}`);
	writeFileSync(join(design, 'prototypes', '_template.md'), '# Template');
	project(
		'alpha',
		'# Alerts <history>\n\nA list.\n',
		[
			record('v1', { createdAt: '2026-10-01T10:00:00Z', contributors: [{ name: 'Noah Shrader', login: 'noah' }] }),
			record('v3', { createdAt: '2026-10-03T10:00:00Z', contributors: [{ name: 'Pat', login: 'pat' }], from: 'v1' }),
			record('v2', { createdAt: '2026-10-02T10:00:00Z' }),
			// Codebase work is not a page.
			{ name: 'codebase', branch: 'feature/alpha', commit: null, note: '' },
		],
		{ v1: page('Alpha one'), v3: page('Alpha three'), v2: page('Alpha two') },
	);
	project('beta', '# Beta\n', [record('v1', { createdAt: '2026-09-30T10:00:00Z' })], { v1: page('Beta') });
	// Recorded, but no page was ever saved: nothing to show.
	project('gamma', '# Gamma\n', [record('v1')], {});
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('the index', () => {
	it('lists every project with a page, by its brief title, and none without', () => {
		build();
		const index = read('index.html');
		// Each goes to its newest version: a project has no page of its own.
		expect(index).toContain('href="prototype/alpha/v3/"');
		expect(index).toContain('href="prototype/beta/v1/"');
		expect(index).not.toContain('gamma');
		expect(index).not.toContain('_template');
		// Titles are text, never markup.
		expect(index).toContain('Alerts &lt;history&gt;');
		expect(existsSync(join(out, 'prototype', 'gamma'))).toBe(false);
	});

	it('links in the brand’s purple, the one the app’s links are, and in no colour of its own', () => {
		build();
		const index = read('index.html');
		expect(index).toContain(`a { color: ${INK.link}; }`);
		expect(INK.link).toMatch(/^color-mix\(in srgb, #[0-9a-f]{6} \d+%, CanvasText\)$/i);
		expect(index).not.toMatch(/a \{ color: inherit/);
	});
});

describe('a version', () => {
	it("is its saved page under a bar that is a link back to all the prototypes, which the viewer replaces with the app's own", () => {
		build();
		const viewer = read('prototype/alpha/v3/index.html');
		expect(viewer).toContain('<iframe');
		expect(viewer).toContain('src="page.html"');
		expect(viewer).toContain('<header id="dsnr-bar"><a href="../../../">All prototypes</a></header>');
		// Nothing of the bar is styled or built here: no select of its own, no styles for one.
		expect(viewer).not.toMatch(/<select|class="bar"|\.bar\b/);
		expect(read('prototype/alpha/v3/page.html')).toContain('Alpha three');
	});

	it('finds the design system fonts from wherever the site is served', () => {
		build();
		const saved = read('prototype/alpha/v3/page.html');
		expect(saved).toContain(`url(../../../_shared/${HASH}.woff2)`);
		expect(saved).not.toContain('url(/_shared/');
		expect(readFileSync(join(out, '_shared', `${HASH}.woff2`)).equals(FONT)).toBe(true);
	});

	it('is not read from a record in the old shape, a version and its iteration: that project shows nothing', () => {
		project('delta', '# Delta\n', [record('v1-i1')], { 'v1-i1': page('Delta') });
		build();
		expect(existsSync(join(out, 'prototype', 'delta'))).toBe(false);
		expect(read('index.html')).not.toContain('delta/');
	});
});

describe('a project', () => {
	it('has no page of its own: its address, which a link may have, leads to its newest version', () => {
		build();
		expect(read('prototype/alpha/index.html')).toContain('url=v3/');
		expect(read('prototype/alpha/index.html')).not.toContain('Version 2');
		expect(read('prototype/beta/index.html')).toContain('url=v1/');
	});

	it('is given to the viewer with the page of all prototypes to go back to', () => {
		const viewer = join(root, 'viewer');
		mkdirSync(viewer, { recursive: true });
		for (const f of ['viewer.js', 'viewer.css', 'viewer.ttf', 'page-agent.js']) writeFileSync(join(viewer, f), '');
		build({ viewer: { dir: viewer, ref: { owner: 'o', repo: 'r' } } });
		const config = JSON.parse(
			/<script type="application\/json" id="dsnr-config">(.*?)<\/script>/s.exec(read('prototype/alpha/v3/index.html'))?.[1] ?? 'null',
		);
		expect(config).toMatchObject({ projectHref: '../', prototypesHref: '../../../' });
	});
});

describe('on a phone', () => {
	it('keeps the prototype at a computer’s width, to scroll across, and says it is best on a computer', () => {
		build();
		const html = read('prototype/alpha/v3/index.html');
		expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
		expect(html).toContain('<p class="small-screen">Best on a computer');
		expect(html).toMatch(/@media \(max-width: 767px\) \{[^}]*\.small-screen \{ display: block; \}[\s\S]*\.stage iframe \{ min-width: 1024px; \}/);
	});
});

describe('latest', () => {
	it('goes to the newest version, and is the only latest there is', () => {
		build();
		expect(read('prototype/alpha/latest/index.html')).toContain('url=../v3/');
		expect(read('prototype/beta/latest/index.html')).toContain('url=../v1/');
		expect(existsSync(join(out, 'prototype', 'alpha', 'v1', 'latest'))).toBe(false);
	});
});

describe('there is no selected version', () => {
	it('so latest is always the newest version, even with a file left from before', () => {
		writeFileSync(join(design, 'prototypes', 'alpha', 'selected.json'), '{ "version": 1 }\n');
		build();
		expect(read('prototype/alpha/latest/index.html')).toContain('url=../v3/');
		expect(read('prototype/alpha/index.html')).toContain('url=v3/');
	});
});

describe('building', () => {
	it('links only within itself, so it works from any address it is served at', () => {
		build();
		const files = ['index.html', 'prototype/alpha/index.html', 'prototype/alpha/v3/index.html', 'prototype/alpha/latest/index.html'].map(read);
		for (const html of files) expect(html).not.toMatch(/(?:href|src|value)="\//);
	});

	it('is rebuilt in full each time: what is no longer in the repository is no longer on the site', () => {
		build();
		rmSync(join(design, 'prototypes', 'beta'), { recursive: true });
		build();
		expect(existsSync(join(out, 'prototype', 'beta'))).toBe(false);
		expect(read('index.html')).not.toContain('beta/');
	});

	it('never clears a folder it did not make', () => {
		mkdirSync(out);
		writeFileSync(join(out, 'notes.txt'), 'mine');
		expect(() => build()).toThrow(/not a site/);
		expect(readdirSync(out)).toEqual(['notes.txt']);
	});

	it('says what it built', () => {
		const built = build();
		expect(built.projects.map((p) => [p.id, p.pages])).toEqual([
			['alpha', 3],
			['beta', 1],
		]);
	});
});

describe('signing in to comment', () => {
	const withViewer = (signIn?: { clientId: string; exchange: string }) => {
		const viewer = join(root, 'viewer');
		mkdirSync(viewer, { recursive: true });
		for (const f of ['viewer.js', 'viewer.css', 'viewer.ttf', 'page-agent.js']) writeFileSync(join(viewer, f), '');
		build({ viewer: { dir: viewer, ref: { owner: 'Acme', repo: 'design' } }, ...(signIn ? { signIn } : {}) });
	};
	const said = (html: string) => JSON.parse(/<script type="application\/json" id="dsnr-sign-in">([^<]*)<\/script>/.exec(html)?.[1] ?? 'null');
	const SIGN_IN = { clientId: 'Iv-test', exchange: 'https://dsnr-auth.vercel.app/api/exchange' };

	it('tells every version’s page the App, the function, GitHub’s sign-in page and the site’s own address', () => {
		withViewer(SIGN_IN);
		expect(said(read('prototype/alpha/v3/index.html'))).toEqual({
			...SIGN_IN,
			redirect: 'https://acme.github.io/design/',
			authorize: 'https://github.com/login/oauth/authorize',
		});
	});

	it('gives the front page, where GitHub sends a person back, the viewer to finish signing in', () => {
		withViewer(SIGN_IN);
		const index = read('index.html');
		expect(said(index)).toMatchObject({ clientId: SIGN_IN.clientId });
		expect(index).toContain('<script type="module" src="_viewer/viewer.js"></script>');
	});

	it('says nothing of signing in without a client ID, or without a viewer', () => {
		withViewer({ clientId: '', exchange: SIGN_IN.exchange });
		expect(read('prototype/alpha/v3/index.html')).not.toContain('dsnr-sign-in');
		expect(read('index.html')).not.toContain('viewer.js');
		build({ signIn: SIGN_IN });
		expect(read('index.html')).not.toContain('dsnr-sign-in');
	});
});

describe('comments on the page', () => {
	it('carries the viewer on every version, told which version it is, with room for it in the bar and beside the frame', () => {
		const viewer = join(root, 'viewer');
		mkdirSync(viewer);
		writeFileSync(join(viewer, 'viewer.js'), 'console.log(1)');
		writeFileSync(join(viewer, 'viewer.css'), 'a{}');
		writeFileSync(join(viewer, 'viewer.ttf'), 'font');
		writeFileSync(join(viewer, 'page-agent.js'), 'agent()');
		build({ viewer: { dir: viewer, ref: { owner: 'acme', repo: 'design' } } });
		expect(readFileSync(join(out, '_viewer', 'viewer.js'), 'utf8')).toBe('console.log(1)');
		expect(readFileSync(join(out, '_viewer', 'page-agent.js'), 'utf8')).toBe('agent()');
		const html = read('prototype/alpha/v3/index.html');
		expect(html).toContain('<script type="module" src="../../../_viewer/viewer.js"></script>');
		expect(html).toContain('href="../../../_viewer/viewer.css"');
		const config = JSON.parse(/<script type="application\/json" id="dsnr-config">([^<]*)<\/script>/.exec(html)?.[1] ?? 'null');
		expect(config).toEqual({
			owner: 'acme',
			repo: 'design',
			projectId: 'alpha',
			name: 'v3',
			title: 'Alerts <history>',
			projectHref: '../',
			prototypesHref: '../../../',
			versions: [
				{ name: 'v3', href: '../v3/', from: 'v1' },
				{ name: 'v2', href: '../v2/' },
				{ name: 'v1', href: '../v1/' },
			],
			states: [],
			// The saved page's fingerprint, which a comment placed on it carries: the hash its picture is named by too.
			page: contentHashOf(page('Alpha three')),
		});
		for (const id of ['dsnr-bar', 'dsnr-panel', 'dsnr-frame']) expect(html).toContain(`id="${id}"`);
	});

	it('tells it the states the page has, for its bar to offer', () => {
		const viewer = join(root, 'viewer');
		mkdirSync(viewer);
		for (const f of ['viewer.js', 'viewer.css', 'viewer.ttf', 'page-agent.js']) writeFileSync(join(viewer, f), '');
		writeFileSync(
			join(design, 'prototypes', 'alpha', 'v2.html'),
			page('Alpha two').replace('<head>', '<head><meta name="dsnr-states" content="default,filtered,panel">'),
		);
		build({ viewer: { dir: viewer, ref: { owner: 'acme', repo: 'design' } } });
		const config = JSON.parse(
			/<script type="application\/json" id="dsnr-config">([^<]*)<\/script>/.exec(read('prototype/alpha/v2/index.html'))?.[1] ?? 'null',
		);
		expect(config.states).toEqual(['default', 'filtered', 'panel']);
	});

	it('puts the page agent first in every prototype’s page, so the bar can ask it for its pins', () => {
		const viewer = join(root, 'viewer');
		mkdirSync(viewer);
		for (const f of ['viewer.js', 'viewer.css', 'viewer.ttf', 'page-agent.js']) writeFileSync(join(viewer, f), '');
		build({ viewer: { dir: viewer, ref: { owner: 'acme', repo: 'design' } } });
		const agent = '<script src="../../../_viewer/page-agent.js"></script>';
		const saved = read('prototype/alpha/v3/page.html');
		expect(saved.indexOf(agent)).toBeGreaterThan(-1);
		expect(saved.indexOf(agent)).toBeLessThan(saved.indexOf('Alpha three'));
		expect(saved.split(agent)).toHaveLength(2);
		expect(saved).toMatch(new RegExp(`<head[^>]*>${agent.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`));
	});

	it('sets no heading’s size for the whole page: the review bar’s title is the app’s own, and a rule outside its styles’ layer would override it', () => {
		const viewer = join(root, 'viewer');
		mkdirSync(viewer);
		for (const f of ['viewer.js', 'viewer.css', 'viewer.ttf', 'page-agent.js']) writeFileSync(join(viewer, f), '');
		build({ viewer: { dir: viewer, ref: { owner: 'acme', repo: 'design' } } });
		const rules = (html: string) =>
			[...(/<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(^|\})\s*([^{}@]+)\{/g)].map((m) =>
				(m[2] as string).trim(),
			);
		// The review page: nothing selects a bare heading, which would reach the bar's title.
		expect(rules(read('prototype/alpha/v3/index.html')).filter((r) => /^h[1-6]\b/.test(r))).toEqual([]);
		expect(rules(read('index.html'))).toContain('main h1');
	});

	it('cannot be built with a viewer that has no page agent: its pages would have no pins', () => {
		const viewer = join(root, 'viewer');
		mkdirSync(viewer);
		for (const f of ['viewer.js', 'viewer.css', 'viewer.ttf']) writeFileSync(join(viewer, f), '');
		expect(() => build({ viewer: { dir: viewer, ref: { owner: 'acme', repo: 'design' } } })).toThrow(/page-agent\.js/);
	});

	it('frames each page from the pages’ address when told one, sandboxed, so the page cannot reach the bar', () => {
		build({ pagesAt: 'http://127.0.0.1:4100/review/' });
		const frame = /<iframe id="dsnr-frame"[^>]*>/.exec(read('prototype/alpha/v3/index.html'))?.[0] ?? '';
		expect(frame).toContain('src="http://127.0.0.1:4100/review/prototype/alpha/v3/page.html"');
		expect(frame).toContain('sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"');
		expect(frame).not.toContain('allow-top-navigation');
	});

	it('frames each page from beside it, as the published site does, sandboxed with no origin of its own, when told none', () => {
		build();
		const frame = /<iframe id="dsnr-frame"[^>]*>/.exec(read('prototype/alpha/v3/index.html'))?.[0] ?? '';
		expect(frame).toContain('src="page.html"');
		// Not its own origin: on the bar's address that would let it take the sandbox off through the bar, and read the
		// bar's storage, where the sign-in's token is.
		expect(frame).toContain('sandbox="allow-scripts allow-forms allow-popups allow-modals"');
		expect(frame).not.toContain('allow-same-origin');
		expect(frame).not.toContain('allow-top-navigation');
	});

	it('leaves the pages as they were without it', () => {
		build();
		expect(read('prototype/alpha/v3/page.html')).not.toContain('page-agent.js');
		expect(read('prototype/alpha/v3/index.html')).not.toContain('viewer.js');
		expect(existsSync(join(out, '_viewer'))).toBe(false);
	});
});

describe('serving it here, to look at', () => {
	it('serves the site, with the types a browser needs, and nothing outside it', async () => {
		build();
		writeFileSync(join(root, 'secret.txt'), 'outside the site');
		const { server, url } = await serveSite(out);
		try {
			const get = (path: string) => fetch(new URL(path, url), { redirect: 'manual' });
			expect((await get('prototype/alpha/v3/')).headers.get('content-type')).toContain('text/html');
			expect(await (await get('prototype/alpha/v3/page.html')).text()).toContain('Alpha three');
			expect((await get(`_shared/${HASH}.woff2`)).headers.get('content-type')).toBe('font/woff2');
			writeFileSync(join(out, 'x.js'), '1');
			writeFileSync(join(out, 'x.css'), 'a{}');
			expect((await get('x.js')).headers.get('content-type')).toContain('text/javascript');
			expect((await get('x.css')).headers.get('content-type')).toContain('text/css');
			// Without its slash a folder's relative links would point one level up, so it is sent to the slashed address.
			const bare = await get('prototype/alpha/v3');
			expect(bare.status).toBe(301);
			expect(bare.headers.get('location')).toBe('/prototype/alpha/v3/');
			expect((await get('%2e%2e/secret.txt')).status).toBe(404);
			expect((await get('nope/')).status).toBe(404);
		} finally {
			server.close();
		}
	});
});
