import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSite } from '../src/site/buildSite';
import { serveSite } from '../src/site/serveSite';

/**
 * The site prototypes are published as (M5a of the Pages plan), built from a design repository: every project with a
 * saved page, every version and iteration of it, `latest` links, and an index. Against a fixture repository with two
 * projects, two versions and three iterations, and one project with nothing to show.
 */

let root: string;
let design: string;
let out: string;

const FONT = Buffer.from('not really a font, but bytes all the same');
const HASH = '0123456789abcdef';
const page = (text: string) => `<!doctype html><html><head><style>@font-face{src:url(/_shared/${HASH})}</style></head><body><h1>${text}</h1></body></html>`;
const record = (name: string, more: Record<string, unknown> = {}) => ({
	projectId: 'x',
	name,
	branch: `prototype/x/${name}`,
	commit: null,
	note: '',
	...more,
});
const project = (id: string, brief: string | null, iterations: Record<string, unknown>[], pages: Record<string, string>) => {
	const dir = join(design, 'projects', id);
	mkdirSync(join(dir, 'prototypes'), { recursive: true });
	if (brief !== null) writeFileSync(join(dir, 'brief.md'), brief);
	writeFileSync(join(dir, 'iterations.json'), JSON.stringify(iterations.map((i) => ({ ...i, projectId: id, branch: String(i.branch).replace('/x/', `/${id}/`) }))));
	for (const [name, html] of Object.entries(pages)) writeFileSync(join(dir, 'prototypes', `${name}.html`), html);
};
const read = (path: string) => readFileSync(join(out, path), 'utf8');
const build = (more: Partial<Parameters<typeof buildSite>[0]> = {}) => buildSite({ designRoot: design, outDir: out, ...more });

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'fdw-site-'));
	design = join(root, 'flock-designer');
	out = join(root, 'site');
	mkdirSync(join(design, 'projects', '_shared'), { recursive: true });
	writeFileSync(join(design, 'projects', '_shared', `${HASH}.datauri`), `data:font/woff2;base64,${FONT.toString('base64')}`);
	writeFileSync(join(design, 'projects', '_template.md'), '# Template');
	project(
		'alpha',
		'# Alerts <history>\n\nA list.\n',
		[
			record('v1-i1', { createdAt: '2026-10-01T10:00:00Z', contributors: [{ name: 'Noah Shrader', login: 'noah' }] }),
			record('v1-i2', { createdAt: '2026-10-03T10:00:00Z', contributors: [{ name: 'Pat', login: 'pat' }] }),
			record('v2-i1', { createdAt: '2026-10-02T10:00:00Z' }),
			// Codebase work is not a page.
			{ name: 'codebase', branch: 'feature/alpha', commit: null, note: '' },
		],
		{ 'v1-i1': page('Alpha one'), 'v1-i2': page('Alpha one, refined'), 'v2-i1': page('Alpha two') },
	);
	// Named before versions: version 1.
	project('beta', '# Beta\n', [record('i1', { createdAt: '2026-09-30T10:00:00Z' })], { i1: page('Beta') });
	// Recorded, but no page was ever saved: nothing to show.
	project('gamma', '# Gamma\n', [record('v1-i1')], {});
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('the index', () => {
	it('lists every project with a page, by its brief title, and none without', () => {
		build();
		const index = read('index.html');
		expect(index).toContain('href="alpha/"');
		expect(index).toContain('href="beta/"');
		expect(index).not.toContain('gamma');
		expect(index).not.toContain('_template');
		// Titles are text, never markup.
		expect(index).toContain('Alerts &lt;history&gt;');
		expect(existsSync(join(out, 'gamma'))).toBe(false);
	});
});

describe('an iteration', () => {
	it('is its saved page, inside a bar that names the project and switches versions and iterations', () => {
		build();
		const viewer = read('alpha/v1/i2/index.html');
		expect(viewer).toContain('<iframe');
		expect(viewer).toContain('src="page.html"');
		expect(viewer).toContain('href="../../"');
		expect(viewer).toContain('Alerts &lt;history&gt;');
		// Every iteration of every version is a step away.
		for (const link of ['../../v1/i1/', '../../v1/i2/', '../../v2/i1/']) expect(viewer).toContain(`value="${link}"`);
		expect(viewer).toMatch(/V1 · I2/);
		expect(read('alpha/v1/i2/page.html')).toContain('Alpha one, refined');
	});

	it('finds the design system fonts from wherever the site is served', () => {
		build();
		const saved = read('alpha/v1/i2/page.html');
		expect(saved).toContain(`url(../../../_shared/${HASH}.woff2)`);
		expect(saved).not.toContain('url(/_shared/');
		expect(readFileSync(join(out, '_shared', `${HASH}.woff2`)).equals(FONT)).toBe(true);
	});

	it('is at version 1 when it was named before versions', () => {
		build();
		expect(read('beta/v1/i1/page.html')).toContain('Beta');
	});
});

describe('a project', () => {
	it('shows its versions side by side, each with its iterations newest first, with date, author and comments', () => {
		build({ comments: new Map([['prototype/alpha/v1-i2', 3]]) });
		const html = read('alpha/index.html');
		const v1 = html.indexOf('V1');
		const v2 = html.indexOf('V2');
		expect(v1).toBeGreaterThan(-1);
		expect(v2).toBeGreaterThan(v1);
		// Within V1, I2 (the newer) comes first.
		expect(html.indexOf('href="v1/i2/"')).toBeLessThan(html.indexOf('href="v1/i1/"'));
		expect(html).toContain('Oct 3, 2026');
		expect(html).toContain('Pat');
		expect(html).toContain('3 comments');
		expect(html).toContain('href="../"');
	});
});

describe('latest', () => {
	it("goes to a version's newest iteration, and to the newest version's", () => {
		build();
		expect(read('alpha/v1/latest/index.html')).toContain('url=../i2/');
		expect(read('alpha/latest/index.html')).toContain('url=../v2/i1/');
		expect(read('beta/latest/index.html')).toContain('url=../v1/i1/');
	});
});

describe('building', () => {
	it('links only within itself, so it works from any address it is served at', () => {
		build();
		const files = ['index.html', 'alpha/index.html', 'alpha/v1/i2/index.html', 'alpha/latest/index.html'].map(read);
		for (const html of files) expect(html).not.toMatch(/(?:href|src|value)="\//);
	});

	it('is rebuilt in full each time: what is no longer in the repository is no longer on the site', () => {
		build();
		rmSync(join(design, 'projects', 'beta'), { recursive: true });
		build();
		expect(existsSync(join(out, 'beta'))).toBe(false);
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

describe('serving it here, to look at', () => {
	it('serves the site, with the types a browser needs, and nothing outside it', async () => {
		build();
		writeFileSync(join(root, 'secret.txt'), 'outside the site');
		const { server, url } = await serveSite(out);
		try {
			const get = (path: string) => fetch(new URL(path, url), { redirect: 'manual' });
			expect((await get('alpha/v1/i2/')).headers.get('content-type')).toContain('text/html');
			expect(await (await get('alpha/v1/i2/page.html')).text()).toContain('Alpha one, refined');
			expect((await get(`_shared/${HASH}.woff2`)).headers.get('content-type')).toBe('font/woff2');
			// Without its slash a folder's relative links would point one level up, so it is sent to the slashed address.
			const bare = await get('alpha/v1/i2');
			expect(bare.status).toBe(301);
			expect(bare.headers.get('location')).toBe('/alpha/v1/i2/');
			expect((await get('%2e%2e/secret.txt')).status).toBe(404);
			expect((await get('nope/')).status).toBe(404);
		} finally {
			server.close();
		}
	});
});
