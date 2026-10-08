// @vitest-environment jsdom
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { TextEncoder as NodeTextEncoder } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrototypeServer } from '../src/main/services/prototypeServer';
import { buildPreviews, hasPackages, notInstalled, previewEntry, StoryPreviews, unresolved } from '../src/main/services/storyPreviews';
import { g } from './fixtures';

/**
 * The previews of the library's stories (P1 of the design system plan), against a small library made here: a bare
 * `develop` cloned, with the packages a build needs linked in. A stand-in for Storybook's portable stories is the only
 * fake; the real ones are built and rendered against the real library when it is on this machine.
 */

// esbuild, which builds the previews, refuses to start where `TextEncoder` and `Uint8Array` come from different places,
// as they do in this DOM window; the page is rendered here, so they are given the same ones esbuild runs with in Node.
globalThis.TextEncoder = NodeTextEncoder as typeof TextEncoder;
globalThis.Uint8Array = Object.getPrototypeOf(Buffer.prototype).constructor as typeof Uint8Array;

/** A DOM window has no ResizeObserver: this one reports once when it starts watching, which is all the page needs. */
class OneShotObserver {
	constructor(private readonly report: () => void) {}
	observe() {
		this.report();
	}
	disconnect() {}
}
globalThis.ResizeObserver = OneShotObserver as unknown as typeof ResizeObserver;

const APP_MODULES = join(__dirname, '..', 'node_modules');
let home: string;
let clone: string;
let upstream: string;
let folder: string;
let server: PrototypeServer;

const write = (root: string, files: Record<string, string>) => {
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
};
const commit = (root: string, message: string) => {
	g(root, 'add', '-A');
	g(root, '-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', message);
};
const story = (title: string, body: string) => `const meta = { title: '${title}' };\nexport default meta;\n${body}\n`;
/** Library files: two components, one of them with Sass; and the library's own preview set-up. */
const LIBRARY = {
	'.storybook/preview.tsx': 'export default {};\n',
	'src/components/FSOne/FSOne.stories.tsx': story('Buttons/FSOne', `import './one.scss';\nexport const Default = () => <button className="one">One</button>;\nexport const Other = () => <span>Other</span>;`),
	'src/components/FSOne/one.scss': '$c: red;\n.one { color: $c; }\n',
	'src/components/FSTwo/FSTwo.stories.tsx': story('Inputs/FSTwo', `export const Default = () => <p>Two</p>;`),
};
/** What Storybook's `composeStories` does for plain components, and nothing more. */
const FAKE_STORYBOOK = {
	'node_modules/@storybook/react/package.json': '{"name":"@storybook/react","version":"0.0.0","main":"index.js"}',
	'node_modules/@storybook/react/index.js': `exports.setProjectAnnotations = () => {};\nexports.composeStories = (m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== 'default').map(([k, v]) => [k, v]));\n`,
};

/** A clone of a library whose `develop` has `files`, with packages installed (React from the app, Storybook faked). */
const makeLibrary = (files: Record<string, string>, packages = true) => {
	write(upstream, files);
	commit(upstream, 'library');
	g(upstream, 'push', '-q', 'origin', 'develop');
	g(home, 'clone', '-q', join(home, 'remote.git'), clone);
	if (packages) {
		mkdirSync(join(clone, 'node_modules', '@storybook'), { recursive: true });
		for (const p of ['react', 'react-dom', 'scheduler']) symlinkSync(join(APP_MODULES, p), join(clone, 'node_modules', p), 'junction');
		write(clone, FAKE_STORYBOOK);
	}
};
const previews = (more: Partial<ConstructorParameters<typeof StoryPreviews>[0]> = {}) => new StoryPreviews({ find: () => clone, folder, server, ...more });
const ready = async (p: StoryPreviews) => {
	const r = await p.preview();
	if (r.state !== 'ready') throw new Error(`not ready: ${JSON.stringify(r)}`);
	return r.base;
};
/** Renders one story file's page in this jsdom window, as the preview frame does, and gives what it drew. */
const render = async (base: string, file: string): Promise<HTMLElement> => {
	document.body.innerHTML = '<div id="root"></div>';
	window.history.pushState({}, '', `/?file=${encodeURIComponent(file)}`);
	const entry = join(folder, ...[(await readdirSync(folder))[0]!, 'site', 'entry.js']);
	// The built page is modules in chunks, which a DOM window cannot load itself: joined into one script, as built, and run.
	const { build } = await import('esbuild');
	const joined = await build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', logLevel: 'silent' });
	(0, eval)(joined.outputFiles[0]!.text);
	await vi.waitFor(() => expect(document.querySelector('#root')!.children.length).toBeGreaterThan(0), { timeout: 5000 });
	void base;
	return document.querySelector('#root') as HTMLElement;
};

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'fdw-previews-'));
	folder = join(home, 'previews');
	upstream = join(home, 'upstream');
	clone = join(home, 'GitHub', 'flock-react-component-lib');
	g(home, 'init', '-q', '--bare', '-b', 'develop', join(home, 'remote.git'));
	g(home, 'init', '-q', '-b', 'develop', upstream);
	g(upstream, 'remote', 'add', 'origin', join(home, 'remote.git'));
	server = new PrototypeServer();
});
afterEach(() => {
	server.close();
	rmSync(home, { recursive: true, force: true });
});

describe('building the previews', () => {
	it('builds every story file of develop once, serves the page and its files, and compiles Sass', async () => {
		makeLibrary(LIBRARY);
		const base = await ready(previews());
		expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/previews-[0-9a-f]{12}\/$/);
		expect((await fetch(base)).status).toBe(200);
		expect((await fetch(`${base}entry.js`)).headers.get('content-type')).toContain('javascript');
		const css = await (await fetch(`${base}entry.css`)).text();
		expect(css).toMatch(/\.one\{color:(red|#f00)\}/);
	});

	it('draws each story of a file by name, and the file asked for only', async () => {
		makeLibrary(LIBRARY);
		const base = await ready(previews());
		const root = await render(base, 'src/components/FSOne/FSOne.stories.tsx');
		expect([...root.querySelectorAll('[data-story]')].map((s) => s.getAttribute('data-story'))).toEqual(['Default', 'Other']);
		expect(root.textContent).toContain('One');
		expect(root.textContent).not.toContain('Two');
	});

	it('tells the page that frames it how tall it is, and nothing else', async () => {
		makeLibrary(LIBRARY);
		const heard: unknown[] = [];
		const listen = (e: MessageEvent) => heard.push(e.data);
		window.addEventListener('message', listen);
		await render(await ready(previews()), 'src/components/FSOne/FSOne.stories.tsx');
		await vi.waitFor(() => expect(heard.length).toBeGreaterThan(0));
		window.removeEventListener('message', listen);
		expect(heard.every((m) => Object.keys(m as object).join() === 'flockPreviewHeight' && typeof (m as { flockPreviewHeight: unknown }).flockPreviewHeight === 'number')).toBe(true);
	});

	it('shows a story that throws as its error, and the others still render', async () => {
		makeLibrary({ ...LIBRARY, 'src/components/FSOne/FSOne.stories.tsx': story('Buttons/FSOne', `export const Broken = () => { throw new Error('boom'); };\nexport const Fine = () => <b>fine</b>;`) });
		const root = await render(await ready(previews()), 'src/components/FSOne/FSOne.stories.tsx');
		expect(root.querySelector('.fd-error')?.textContent).toContain('boom');
		expect(root.textContent).toContain('fine');
	});

	it('sets aside only what is not installed: the stories that do not use it build and render, and the one that does says so', async () => {
		makeLibrary({
			...LIBRARY,
			'src/icons/index.ts': "export * from './symbols.generated';\n",
			'src/components/FSTwo/FSTwo.stories.tsx': story('Inputs/FSTwo', `import { ArrowSymbol } from '../../icons/symbols.generated';\nexport const Default = () => <p>{String(ArrowSymbol)}</p>;`),
		});
		const p = previews();
		const base = await ready(p);
		const one = await render(base, 'src/components/FSOne/FSOne.stories.tsx');
		expect(one.textContent).toContain('One');
		const two = await render(base, 'src/components/FSTwo/FSTwo.stories.tsx');
		expect(two.querySelector('.fd-error')?.textContent).toContain(notInstalled('../../icons/symbols.generated'));
	});

	it('does not set aside a build error that is not a missing import', async () => {
		makeLibrary({ ...LIBRARY, 'src/components/FSTwo/FSTwo.stories.tsx': story('Inputs/FSTwo', 'export const Default = () => <p>;') });
		const r = await previews().preview();
		expect(r).toMatchObject({ state: 'failed', error: expect.stringContaining('FSTwo.stories.tsx') });
	});

	it('says every error as it is when the build has a real error beside a missing import, setting nothing aside', async () => {
		makeLibrary({
			...LIBRARY,
			'src/components/FSOne/FSOne.stories.tsx': story('Buttons/FSOne', "import './gone';\nexport const Default = () => <p>One</p>;"),
			'src/components/FSTwo/FSTwo.stories.tsx': story('Inputs/FSTwo', 'export const Default = () => <p>;'),
		});
		const r = await previews().preview();
		expect(r).toMatchObject({ state: 'failed', error: expect.stringContaining('Could not resolve "./gone"') });
		expect(r).toMatchObject({ error: expect.stringContaining('FSTwo.stories.tsx') });
	});
});

describe('keeping them', () => {
	it('builds once for a commit, however often it is asked for, even at once', async () => {
		makeLibrary(LIBRARY);
		const build = vi.fn(buildPreviews);
		const p = previews({ build });
		const [a, b] = await Promise.all([p.preview(), p.preview()]);
		await p.preview();
		expect(a).toEqual(b);
		expect(build).toHaveBeenCalledOnce();
	});

	it('builds again when develop moves, and keeps only the new build', async () => {
		makeLibrary(LIBRARY);
		const p = previews();
		const first = await ready(p);
		write(upstream, { 'src/components/FSThree/FSThree.stories.tsx': story('Data Display/FSThree', 'export const Default = () => <i>Three</i>;') });
		commit(upstream, 'three');
		g(upstream, 'push', '-q', 'origin', 'develop');
		g(clone, 'fetch', '-q', 'origin', 'develop');
		const second = await ready(p);
		expect(second).not.toBe(first);
		expect(readdirSync(folder)).toHaveLength(1);
		expect((await fetch(first)).status).toBe(404);
		expect((await fetch(second)).status).toBe(200);
		expect(readFileSync(join(folder, readdirSync(folder)[0]!, 'library', 'src/components/FSThree/FSThree.stories.tsx'), 'utf8')).toContain('Three');
	});

	it('tries again, and does not remember, a build that failed', async () => {
		makeLibrary(LIBRARY);
		const build = vi.fn(async () => {
			throw new Error('disk full');
		});
		const p = previews({ build });
		expect(await p.preview()).toEqual({ state: 'failed', error: 'disk full' });
		expect(await p.preview()).toEqual({ state: 'failed', error: 'disk full' });
		expect(build).toHaveBeenCalledTimes(2);
		expect(readdirSync(folder)).toEqual([]);
	});
});

describe('what it says when it cannot', () => {
	it('says there is no library, no packages, or no develop', async () => {
		makeLibrary(LIBRARY, false);
		expect(await previews({ find: () => null }).preview()).toEqual({ state: 'no-library' });
		expect(await previews().preview()).toEqual({ state: 'no-packages', root: clone });
		g(clone, 'update-ref', '-d', 'refs/remotes/origin/develop');
		expect(await previews().preview()).toMatchObject({ state: 'failed', error: expect.stringContaining('no develop') });
	});

	it('needs React and Storybook installed, and nothing else', () => {
		expect(hasPackages('/x', (p) => p.includes('react') || p.includes('storybook'))).toBe(true);
		expect(hasPackages('/x', (p) => !p.includes('@storybook'))).toBe(false);
		expect(hasPackages('/x', () => false)).toBe(false);
	});
});

describe('leaving the library alone', () => {
	it('changes no branch, no file and no ref in the clone, and writes nothing into it', async () => {
		makeLibrary(LIBRARY);
		g(clone, 'checkout', '-q', '-b', 'noah/work');
		write(clone, { 'src/components/FSOne/FSOne.stories.tsx': 'unsaved\n' });
		const snapshot = () => ({ head: g(clone, 'rev-parse', 'HEAD'), status: g(clone, 'status', '--porcelain', '--ignored'), refs: g(clone, 'for-each-ref'), files: readdirSync(clone).sort() });
		const before = snapshot();
		await ready(previews());
		expect(snapshot()).toEqual(before);
		expect(readFileSync(join(clone, 'src/components/FSOne/FSOne.stories.tsx'), 'utf8')).toBe('unsaved\n');
	});

	it('builds develop as GitHub has it, not what the clone has checked out', async () => {
		makeLibrary(LIBRARY);
		write(clone, { 'src/components/FSOne/FSOne.stories.tsx': story('Buttons/FSOne', 'export const Local = () => <u>local</u>;') });
		commit(clone, 'local');
		const root = await render(await ready(previews()), 'src/components/FSOne/FSOne.stories.tsx');
		expect([...root.querySelectorAll('[data-story]')].map((s) => s.getAttribute('data-story'))).toEqual(['Default', 'Other']);
	});
});

describe('the page', () => {
	it('lists the story files it can show, once each, and nothing per component', () => {
		const entry = previewEntry('/lib', ['src/a/A.stories.tsx', 'src/b/B.stories.tsx']);
		expect(entry.match(/"src\/a\/A\.stories\.tsx":/g)).toHaveLength(1);
		expect(entry.match(/"src\/b\/B\.stories\.tsx":/g)).toHaveLength(1);
		expect(entry).toContain('"/lib/.storybook/preview"');
		expect(entry).not.toMatch(/FSButton|FSCard/);
	});

	it('knows which imports a build could not resolve', () => {
		expect(unresolved([{ text: 'Could not resolve "../../icons/symbols.generated"' }, { text: 'Could not resolve "left-pad"' }, { text: 'Unexpected "}"' }])).toEqual(
			new Set(['../../icons/symbols.generated', 'left-pad']),
		);
	});
});

describe('serving a built folder', () => {
	it('serves files under it only, by their type, and nothing else', async () => {
		const dir = join(home, 'site');
		write(dir, { 'index.html': '<p>home</p>', 'a/b.css': 'x{}', 'secret.txt': 'no', 'f.woff2': 'font' });
		write(home, { 'outside.html': 'outside' });
		const base = await server.serveFolder('k1', dir);
		expect(await (await fetch(base)).text()).toBe('<p>home</p>');
		expect((await fetch(`${base}a/b.css`)).headers.get('content-type')).toContain('text/css');
		expect((await fetch(`${base}f.woff2`)).headers.get('content-type')).toBe('font/woff2');
		expect((await fetch(`${base}secret.txt`)).status).toBe(404);
		expect((await fetch(`${base}..%2foutside.html`)).status).toBe(404);
		expect((await fetch(`${base}%2e%2e/outside.html`)).status).toBe(404);
		expect((await fetch(base.replace('/k1/', '/other/'))).status).toBe(404);
		expect((await fetch(base, { method: 'POST' })).status).toBe(404);
	});
});

/**
 * The real library on this machine, not a fixture: every one of develop's story files builds into the page, built with
 * the clone's own packages and nothing fetched. Skipped, loudly, when the library is not checked out beside this repository.
 */
const REAL = '/Users/noah.shrader/Documents/GitHub/flock-react-component-lib';
const realDevelop = (() => {
	try {
		g(REAL, 'rev-parse', '--verify', '--quiet', 'refs/remotes/origin/develop');
		return hasPackages(REAL);
	} catch {
		return false;
	}
})();

describe.skipIf(!realDevelop)('against the real library on origin/develop', () => {
	it('builds every story file with the clone’s own packages, and serves it', async () => {
		const real = new PrototypeServer();
		try {
			const r = await new StoryPreviews({ find: () => REAL, folder, server: real }).preview();
			expect(r.state).toBe('ready');
			if (r.state !== 'ready') return;
			expect((await fetch(r.base)).status).toBe(200);
			const entry = await (await fetch(`${r.base}entry.js`)).text();
			expect(entry).toContain('FSButton');
		} finally {
			real.close();
		}
	}, 120_000);
});
