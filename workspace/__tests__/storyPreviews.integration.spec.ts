// @vitest-environment jsdom
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { TextEncoder as NodeTextEncoder } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_HEIGHT, PREVIEW_SHOW, previewAddress } from '../src/shared/catalog';
import { PrototypeServer } from '../src/main/services/prototypeServer';
import { buildPreviews, hasPackages, notInstalled, previewEntry, StoryPreviews, unresolved } from '../src/main/services/storyPreviews';
import type { CatalogReads } from '../src/main/services/componentCatalog';
import { editedFiles } from '../src/main/services/tokenEdits';
import type { TokenEdit } from '../src/shared/contract';
import { eventually, g } from './fixtures';
import { NO_CHROME, inChrome } from './realChrome';
import { REAL_LIBRARY as REAL, describeWith, libraryUnbuilt } from './realCheckouts';

/**
 * What the builds do, counted on the real esbuild and Sass, so a test can say how a change is built (one build kept
 * open, rebuilt each time, the Sass compiled once) rather than how long it took on a busy machine.
 */
const counted = vi.hoisted(() => ({ contexts: 0, rebuilds: 0, sass: 0 }));
vi.mock('esbuild', async (original) => {
	const real = await original<typeof import('esbuild')>();
	return {
		...real,
		context: async (options: Parameters<typeof real.context>[0]) => {
			counted.contexts++;
			const open = await real.context(options);
			return Object.assign(Object.create(open) as typeof open, {
				rebuild: () => (counted.rebuilds++, open.rebuild()),
			});
		},
	};
});
vi.mock('sass', async (original) => {
	const real = await original<typeof import('sass')>();
	return {
		...real,
		compile: (...a: Parameters<typeof real.compile>) => (counted.sass++, real.compile(...a)),
		compileString: (...a: Parameters<typeof real.compileString>) => (counted.sass++, real.compileString(...a)),
	};
});

/** The library as connected (P4): the whole repository, on develop, at `root`. */
const REPOSITORY = 'flocksafety/flock-react-component-lib';
const connected = (root: string) => () => ({ id: REPOSITORY, name: 'FUI', repository: REPOSITORY, root, folder: '', branch: 'develop' });

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
	g(root, 'commit', '-q', '-m', message);
};
const story = (title: string, body: string) => `const meta = { title: '${title}' };\nexport default meta;\n${body}\n`;
/** Library files: two components, one of them with Sass; and the library's own preview set-up. */
const LIBRARY = {
	'.storybook/preview.tsx': 'export default {};\n',
	'src/components/FSOne/FSOne.stories.tsx': story(
		'Buttons/FSOne',
		`import './one.scss';\nexport const Default = () => <button className="one">One</button>;\nexport const Other = () => <span>Other</span>;`,
	),
	'src/components/FSOne/one.scss': '$c: red;\n.one { color: $c; }\n',
	'src/components/FSTwo/FSTwo.stories.tsx': story('Inputs/FSTwo', `export const Default = () => <p>Two</p>;`),
};
/** What Storybook's `composeStories` does for plain components, and nothing more. */
const FAKE_STORYBOOK = {
	'node_modules/@storybook/react/package.json': '{"name":"@storybook/react","version":"0.0.0","main":"index.js"}',
	// A component as is, or a story object drawn from its render and args, with the id and args Storybook gives a story.
	// What the page gives the library's set-up is kept where a test can see it.
	'node_modules/@storybook/react/index.js': `exports.setProjectAnnotations = (a) => { globalThis.projectAnnotations = a; };
const { createElement } = require('react');
exports.composeStories = (m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== 'default').map(([k, v]) => {
	if (typeof v === 'function') return [k, v];
	// As Storybook does: the story's render, else the file's, else its component drawn with the args.
	const render = v.render ?? m.default?.render ?? ((args) => createElement(m.default.component, args));
	const story = (props) => render({ ...v.args, ...props });
	return [k, Object.assign(story, { id: 'story-' + k.toLowerCase(), args: v.args })];
}));
`,
};

/**
 * Storybook's channel as its preview has it, at its public path (Storybook 9 on) and its internal one (8 on): what a story's
 * `useArgs` sends `updateStoryArgs` on, and what Storybook says a story was drawn on. What is sent on it is kept.
 */
const FAKE_STORYBOOK_CHANNEL = {
	'node_modules/storybook/package.json':
		'{"name":"storybook","version":"0.0.0","type":"module","exports":{"./preview-api":"./preview-api.js","./internal/preview-api":"./preview-api.js","./internal/core-events":"./core-events.js"}}',
	// ES modules, as the real package ships them.
	'node_modules/storybook/preview-api.js': `const listeners = {};
globalThis.sent = [];
const channel = { on: (e, f) => (listeners[e] ??= []).push(f), emit: (e, ...a) => (globalThis.sent.push([e, ...a]), (listeners[e] ?? []).forEach((f) => f(...a))) };
export const addons = { getChannel: () => channel };
`,
	'node_modules/storybook/core-events.js':
		"export const UPDATE_STORY_ARGS = 'updateStoryArgs';\nexport const RESET_STORY_ARGS = 'resetStoryArgs';\nexport const STORY_RENDERED = 'storyRendered';\n",
};

/** A clone of a library whose `develop` has `files`, with packages installed (React from the app, Storybook faked). */
const makeLibrary = (files: Record<string, string>, packages = true) => {
	write(upstream, files);
	commit(upstream, 'library');
	g(upstream, 'push', '-q', 'origin', 'develop');
	g(home, 'clone', '-q', join(home, 'remote.git'), clone);
	// A clone as a person has one: its origin is the library on GitHub, and git is told to reach that here.
	g(clone, 'remote', 'set-url', 'origin', `https://github.com/${REPOSITORY}.git`);
	g(clone, 'config', `url.${join(home, 'remote.git')}.insteadOf`, `https://github.com/${REPOSITORY}.git`);
	if (packages) {
		mkdirSync(join(clone, 'node_modules', '@storybook'), { recursive: true });
		for (const p of ['react', 'react-dom', 'scheduler']) symlinkSync(join(APP_MODULES, p), join(clone, 'node_modules', p), 'junction');
		write(clone, FAKE_STORYBOOK);
	}
};
const previews = (more: Partial<ConstructorParameters<typeof StoryPreviews>[0]> = {}) =>
	new StoryPreviews({ system: connected(clone), folder, server, ...more });
const ready = async (p: StoryPreviews) => {
	const r = await p.preview();
	if (r.state !== 'ready') throw new Error(`not ready: ${JSON.stringify(r)}`);
	return r.base;
};
/**
 * Renders the page served at `base` for one story file in this DOM window, as the preview frame does: what it drew. In
 * light, or in dark (`dark`), as the browser's color scheme says, which a DOM window does not have on its own.
 */
const render = async (base: string, file: string, { dark = false } = {}): Promise<HTMLElement> => {
	expect((await fetch(previewAddress(base, file))).status).toBe(200);
	window.matchMedia = ((query: string) => ({ matches: dark && /prefers-color-scheme:\s*dark/.test(query) })) as unknown as typeof window.matchMedia;
	document.body.innerHTML = '<div id="root"></div>';
	window.history.pushState({}, '', previewAddress('/', file));
	const entry = join(folder, readdirSync(folder)[0]!, 'site', 'entry.js');
	// The built page is modules in chunks, which a DOM window cannot load itself: joined into one script, as built, and run.
	const { build } = await import('esbuild');
	const joined = await build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', logLevel: 'silent' });
	(0, eval)(joined.outputFiles[0]!.text);
	await eventually(() => expect(document.querySelector('#root')!.children.length).toBeGreaterThan(0));
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
	vi.unstubAllEnvs();
	server.close();
	rmSync(home, { recursive: true, force: true });
});

describe('building the previews', () => {
	it('builds every story file of develop once, serves the page and its files, and compiles Sass', async () => {
		makeLibrary(LIBRARY);
		const base = await ready(previews());
		// The commit, which package of the repository (a monorepo has several), and how this app builds.
		expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/previews-[0-9a-f]{12}-[0-9a-f]{4}-[0-9a-f]{8}\/$/);
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

	it('tells the library’s set-up its theme is dark in dark, as Storybook’s themes addon is told, and nothing of it in light', async () => {
		makeLibrary(LIBRARY);
		const base = await ready(previews());
		const given = () => (globalThis as { projectAnnotations?: unknown[] }).projectAnnotations ?? [];
		await render(base, 'src/components/FSOne/FSOne.stories.tsx');
		expect(given()).toHaveLength(1);
		expect(JSON.stringify(given())).not.toContain('theme');
		await render(base, 'src/components/FSOne/FSOne.stories.tsx', { dark: true });
		expect(given()).toHaveLength(2);
		expect(given()[1]).toEqual({ initialGlobals: { theme: 'dark' }, globals: { theme: 'dark' } });
	});

	it('builds a library with no Storybook preview set-up, rendering its stories plainly', async () => {
		const { ['.storybook/preview.tsx']: _, ...noPreview } = LIBRARY;
		makeLibrary(noPreview);
		const root = await render(await ready(previews()), 'src/components/FSTwo/FSTwo.stories.tsx');
		expect(root.textContent).toContain('Two');
		// Nothing was looked for that is not there: no preview set-up is imported, so none had to be set aside.
		const site = join(folder, readdirSync(folder)[0]!, 'site');
		expect(
			readdirSync(site)
				.filter((f) => f.endsWith('.js'))
				.some((f) => readFileSync(join(site, f), 'utf8').includes('Not installed here')),
		).toBe(false);
	});

	it('builds a design system kept in a package of a monorepo with that package’s own Storybook set-up, and the globals it defines', async () => {
		makeLibrary({
			// The repository's own set-up, which is not the design system's.
			'.storybook/preview.tsx': "document.body.dataset.preview = 'repository';\nexport default {};\n",
			'packages/ui/package.json': '{"name":"@acme/ui"}',
			'packages/ui/.storybook/preview.tsx': "document.body.dataset.preview = 'package';\nexport default {};\n",
			// As Primer's does: its build defines a global its code reads, which is not there without it.
			'packages/ui/.storybook/main.ts': `const config = {
  async viteFinal(config) {
    config.define = { ...config.define, __DEV__: JSON.stringify(true), __LABEL__: JSON.stringify('dev'), "process.env.KIND": '"ui"' }
    return config
  },
}
export default config
`,
			'packages/ui/src/Badge/Badge.stories.tsx': story(
				'Data/Badge',
				'export const Default = () => <b>{`${__DEV__} ${__LABEL__} ${process.env.KIND}`}</b>;',
			),
		});
		const p = previews({ system: () => ({ ...connected(clone)(), folder: 'packages/ui' }) });
		const root = await render(await ready(p), 'packages/ui/src/Badge/Badge.stories.tsx');
		expect(document.body.dataset.preview).toBe('package');
		expect(root.textContent).toContain('true dev ui');
	});

	it('builds a package of a monorepo whose packages are its own alone, not hoisted to the repository, as a pnpm workspace has them', async () => {
		makeLibrary(
			{
				'packages/ui/package.json': '{"name":"@acme/ui"}',
				'packages/ui/src/Badge/Badge.stories.tsx': story('Data/Badge', 'export const Default = () => <b>Own</b>;'),
			},
			false,
		);
		const own = join(clone, 'packages', 'ui');
		mkdirSync(join(own, 'node_modules', '@storybook'), { recursive: true });
		for (const p of ['react', 'react-dom', 'scheduler']) symlinkSync(join(APP_MODULES, p), join(own, 'node_modules', p), 'junction');
		write(own, FAKE_STORYBOOK);
		const p = previews({ system: () => ({ ...connected(clone)(), folder: 'packages/ui' }) });
		const root = await render(await ready(p), 'packages/ui/src/Badge/Badge.stories.tsx');
		expect(root.textContent).toContain('Own');
	});

	it('finds a package’s stylesheet named bare as its package exports it, and one it does not list by its path', async () => {
		makeLibrary({
			...LIBRARY,
			'src/components/FSTwo/FSTwo.stories.tsx': story(
				'Inputs/FSTwo',
				"import 'kit/theme.css';\nimport 'kit/dist/raw.css';\nexport const Default = () => <p className=\"kit\">Two</p>;",
			),
		});
		write(clone, {
			'node_modules/kit/package.json': JSON.stringify({ name: 'kit', exports: { './theme.css': './dist/theme.css' } }),
			'node_modules/kit/dist/theme.css': '.kit { color: rgb(4, 5, 6); }\n',
			'node_modules/kit/dist/raw.css': '.raw { color: rgb(7, 8, 9); }\n',
		});
		const css = await (await fetch(`${await ready(previews())}entry.css`)).text();
		expect(css).toMatch(/\.kit\{color:(rgb\(4, ?5, ?6\)|#040506)\}/);
		expect(css).toMatch(/\.raw\{color:(rgb\(7, ?8, ?9\)|#070809)\}/);
	});

	it('draws a story once with each value of each prop asked for, in place of its stories (Phase 5)', async () => {
		const chip = `const Chip = ({ size = 'md', tone = 'plain' }) => <i data-size={size}>{size} {tone}</i>;
const meta = { title: 'Data/Chip', component: Chip };
export default meta;
export const AllSizes = { render: () => <><Chip size="sm" /><Chip size="lg" /></> };
export const Default = { args: { size: 'md' } };`;
		makeLibrary({ ...LIBRARY, 'src/components/Chip/Chip.stories.tsx': chip });
		const root = await render(await ready(previews()), 'src/components/Chip/Chip.stories.tsx');
		const show = (window as unknown as Record<string, (file: string, vary?: unknown) => Promise<void>>)[PREVIEW_SHOW] as (
			file: string,
			vary?: unknown,
		) => Promise<void>;
		const sections = () => [...root.querySelectorAll('[data-story]')].map((e) => [e.getAttribute('data-story'), e.querySelector('i')?.textContent]);
		const props = [
			{ name: 'size', values: ['sm', 'lg'] },
			{ name: 'tone', values: ['loud'] },
		];
		// On the story asked for, each value given to it; the stories' own sections are not drawn.
		await show('src/components/Chip/Chip.stories.tsx', { stories: ['Default'], props });
		expect(sections()).toEqual([
			['Default · size=sm', 'sm plain'],
			['Default · size=lg', 'lg plain'],
			['Default · tone=loud', 'md loud'],
		]);
		// None asked for: the first drawn from its args, not one that draws its own cases.
		await show('src/components/Chip/Chip.stories.tsx', { stories: [], props: props.slice(0, 1) });
		expect(sections().map(([name]) => name)).toEqual(['Default · size=sm', 'Default · size=lg']);
	});

	it.skipIf(NO_CHROME)(
		'draws the file last asked for, when one asked for before it is drawn after, in the browser on this machine',
		async () => {
			// A story file that takes a while to load, as a large one does, asked for first: it must not be drawn over the next.
			const slow = story('Data/Slow', 'await new Promise((r) => setTimeout(r, 400));\nexport const Default = () => <i>slow</i>;');
			makeLibrary({ ...LIBRARY, 'src/components/Slow/Slow.stories.tsx': slow });
			const base = await ready(previews());
			const drawn = await inChrome(async (browser) => {
				const page = await browser.newPage();
				await page.goto(previewAddress(base, 'src/components/FSTwo/FSTwo.stories.tsx'));
				await page.waitForSelector('[data-story]');
				return page.evaluate(async (show) => {
					const draw = (window as unknown as Record<string, (file: string) => Promise<void>>)[show] as (file: string) => Promise<void>;
					await Promise.all([draw('src/components/Slow/Slow.stories.tsx'), draw('src/components/FSOne/FSOne.stories.tsx')]);
					return document.querySelector('#root')?.textContent ?? '';
				}, PREVIEW_SHOW);
			});
			expect(drawn).toContain('One');
			expect(drawn).not.toContain('slow');
		},
		60_000,
	);

	it('redraws a story that updates its own args, as Storybook does, and leaves one that only pins a value alone', async () => {
		makeLibrary({
			...LIBRARY,
			'src/components/FSTwo/FSTwo.stories.tsx': story(
				'Inputs/FSTwo',
				`import { addons } from 'storybook/preview-api';
export const Counting = { args: { value: 1 }, render: (args) => <button onClick={() => addons.getChannel().emit('updateStoryArgs', { storyId: 'story-counting', updatedArgs: { value: args.value + 1 } })}>value {args.value}</button> };
export const Pinned = { args: { checked: true }, render: (args) => <input type="checkbox" checked={args.checked} onChange={() => {}} /> };`,
			),
		});
		write(clone, FAKE_STORYBOOK_CHANNEL);
		const root = await render(await ready(previews()), 'src/components/FSTwo/FSTwo.stories.tsx');
		const counting = root.querySelector('[data-story="Counting"] button') as HTMLButtonElement;
		expect(counting.textContent).toBe('value 1');
		await vi.waitFor(async () => {
			counting.click();
			expect(counting.textContent).not.toBe('value 1');
		});
		const pinned = root.querySelector('[data-story="Pinned"] input') as HTMLInputElement;
		pinned.click();
		expect(pinned.checked).toBe(true);
	});

	it('says on Storybook’s channel that each story is drawn once it is, as Storybook does, so its decorators’ effects run', async () => {
		makeLibrary({
			...LIBRARY,
			'src/components/FSTwo/FSTwo.stories.tsx': story(
				'Inputs/FSTwo',
				'export const Plain = { args: {}, render: () => <p>Plain</p> };\nexport const Other = { args: {}, render: () => <p>Other</p> };',
			),
		});
		write(clone, FAKE_STORYBOOK_CHANNEL);
		await render(await ready(previews()), 'src/components/FSTwo/FSTwo.stories.tsx');
		await eventually(() =>
			expect(
				(globalThis as { sent?: unknown[][] }).sent
					?.filter(([e]) => e === 'storyRendered')
					.map(([, id]) => id)
					.sort(),
			).toEqual(['story-other', 'story-plain']),
		);
	});

	it('lets a control respond whose story only sets checked, and leaves alone a story that draws itself and a value', async () => {
		makeLibrary({
			...LIBRARY,
			'src/components/FSTwo/FSTwo.stories.tsx': `const Box = (props) => <input type="checkbox" {...props} />;
const Line = ({ value }) => <span>shows {value}</span>;
export default { title: 'Inputs/FSTwo', component: Box };
export const Checked = { args: { checked: true } };
export const Drawn = { args: { checked: true }, render: (args) => <input type="checkbox" checked={args.checked} onChange={() => {}} /> };
export const Shown = { args: { value: 'Connected' } };
Shown.render = (args) => <Line {...args} />;`,
			// A label-and-value display, like FUI's PopoverLineItem: its story only sets args, and value is what it shows.
			'src/components/FSLine/FSLine.stories.tsx': `const Line = ({ label, value }) => <span>{label}: {value}</span>;
export default { title: 'Data/FSLine', component: Line };
export const Status = { args: { label: 'Network', value: 'Connected' } };`,
		});
		const root = await render(await ready(previews()), 'src/components/FSTwo/FSTwo.stories.tsx');
		const box = (name: string) => root.querySelector(`[data-story="${name}"] input`) as HTMLInputElement;
		// Only checked: it starts checked, and a click unchecks it.
		expect(box('Checked').checked).toBe(true);
		box('Checked').click();
		expect(box('Checked').checked).toBe(false);
		// A story that draws itself holds its own value, as in Storybook: it starts as it says, and stays.
		expect(box('Drawn').checked).toBe(true);
		box('Drawn').click();
		expect(box('Drawn').checked).toBe(true);
		expect(root.querySelector('[data-story="Shown"]')?.textContent).toContain('shows Connected');
		// A value is what the component is given, never turned into a starting value: the display still shows it.
		const line = await render(await ready(previews()), 'src/components/FSLine/FSLine.stories.tsx');
		expect(line.querySelector('[data-story="Status"]')?.textContent).toContain('Network: Connected');
	});

	it('tells the page that frames it how tall it is, and nothing else', async () => {
		makeLibrary(LIBRARY);
		const heard: unknown[] = [];
		const listen = (e: MessageEvent) => heard.push(e.data);
		window.addEventListener('message', listen);
		await render(await ready(previews()), 'src/components/FSOne/FSOne.stories.tsx');
		await vi.waitFor(() => expect(heard.length).toBeGreaterThan(0));
		window.removeEventListener('message', listen);
		expect(
			heard.every((m) => Object.keys(m as object).join() === PREVIEW_HEIGHT && typeof (m as Record<string, unknown>)[PREVIEW_HEIGHT] === 'number'),
		).toBe(true);
	});

	it('shows a story that throws as its error, and the others still render', async () => {
		makeLibrary({
			...LIBRARY,
			'src/components/FSOne/FSOne.stories.tsx': story(
				'Buttons/FSOne',
				`export const Broken = () => { throw new Error('boom'); };\nexport const Fine = () => <b>fine</b>;`,
			),
		});
		const root = await render(await ready(previews()), 'src/components/FSOne/FSOne.stories.tsx');
		expect(root.querySelector('.fd-error')?.textContent).toContain('boom');
		expect(root.textContent).toContain('fine');
	});

	it('sets aside only what is not installed: the stories that do not use it build and render, and the one that does says so', async () => {
		makeLibrary({
			...LIBRARY,
			'src/icons/index.ts': "export * from './symbols.generated';\n",
			'src/components/FSTwo/FSTwo.stories.tsx': story(
				'Inputs/FSTwo',
				`import { ArrowSymbol } from '../../icons/symbols.generated';\nexport const Default = () => <p>{String(ArrowSymbol)}</p>;`,
			),
		});
		const p = previews();
		const base = await ready(p);
		const one = await render(base, 'src/components/FSOne/FSOne.stories.tsx');
		expect(one.textContent).toContain('One');
		const two = await render(base, 'src/components/FSTwo/FSTwo.stories.tsx');
		expect(two.querySelector('.fd-error')?.textContent).toContain(notInstalled('../../icons/symbols.generated'));
	});

	it('does not set aside a build error that is not a missing import, and names the file as the library does', async () => {
		makeLibrary({ ...LIBRARY, 'src/components/FSTwo/FSTwo.stories.tsx': story('Inputs/FSTwo', 'export const Default = () => <p>;') });
		const r = await previews().preview();
		expect(r).toMatchObject({ state: 'failed', error: expect.stringMatching(/^src\/components\/FSTwo\/FSTwo\.stories\.tsx: /) });
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
		const forget = vi.spyOn(server, 'stopServing');
		const second = await ready(p);
		expect(second).not.toBe(first);
		// The old address is forgotten by the server, not only emptied on disk.
		expect(forget).toHaveBeenCalledWith(new URL(first).pathname.split('/')[1]);
		expect(readdirSync(folder)).toHaveLength(1);
		expect((await fetch(first)).status).toBe(404);
		expect((await fetch(second)).status).toBe(200);
		expect(readFileSync(join(folder, readdirSync(folder)[0]!, 'library', 'src/components/FSThree/FSThree.stories.tsx'), 'utf8')).toContain('Three');
	});

	it('does not reuse a build an older app made from the same commit', async () => {
		makeLibrary(LIBRARY);
		const head = g(clone, 'rev-parse', 'refs/remotes/origin/develop').trim();
		const stale = join(folder, `${head.slice(0, 12)}-00000000`, 'site');
		write(stale, { 'index.html': 'an older app’s page' });
		const build = vi.fn(buildPreviews);
		const base = await ready(previews({ build }));
		expect(build).toHaveBeenCalledOnce();
		expect(await (await fetch(base)).text()).not.toContain('an older app’s page');
		expect(readdirSync(folder)).toHaveLength(1);
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

describe('trying a change to the tokens (T3)', () => {
	/** The files a token change writes, as a build with it is given them. */
	const withTokens = (edits: TokenEdit[]) => (reads: CatalogReads) => editedFiles(reads, edits);
	/** A library whose story draws with its theme: a tone, a palette role pointing at it, and the story using the role. */
	const THEMED = {
		...LIBRARY,
		'src/colors/tones/brand.ts': "export const brand = {\n  50: '#108062',\n  20: '#18372F',\n};\n",
		'src/colors/theme/light.ts':
			"import { brand } from '../tones/brand';\n\nexport const lightPalette = {\n  mode: 'light',\n  primary: { main: brand[50] },\n};\n",
		'src/components/FSTwo/FSTwo.stories.tsx': story(
			'Inputs/FSTwo',
			"import { lightPalette } from '../../colors/theme/light';\nexport const Default = () => <p style={{ color: lightPalette.primary.main }}>Two</p>;",
		),
	};
	/** Every script a build at `base` wrote, as one text: where a color the stories use ends up. */
	const scripts = (base: string) => {
		const key = new URL(base).pathname.split('/')[1] as string;
		// Served as `<what it is for>-<n>-<commit>`, from the folder of that name; the commit's own build from its site.
		const what = key.split('-')[0] as string;
		const dir = join(folder, readdirSync(folder)[0]!, what === 'previews' ? 'site' : what);
		return readdirSync(dir, { recursive: true })
			.map(String)
			.filter((f) => f.endsWith('.js'))
			.map((f) => readFileSync(join(dir, f), 'utf8'))
			.join('\n');
	};

	it('builds the stories again with the token changed, at an address of its own, and leaves the commit’s build as it was', async () => {
		makeLibrary(THEMED);
		const p = previews();
		const base = await ready(p);
		const r = await p.preview([{ path: 'tone.brand.50', value: '#0A6B52' }]);
		if (r.state !== 'ready') throw new Error(JSON.stringify(r));
		expect(r.base).not.toBe(base);
		expect((await fetch(r.base)).status).toBe(200);
		expect(scripts(r.base)).toContain('#0A6B52');
		expect(scripts(base)).not.toContain('#0A6B52');
		// Written nowhere: not the copy the build is made from, and not the clone.
		const copy = join(folder, readdirSync(folder)[0]!, 'library', 'src/colors/tones/brand.ts');
		expect(readFileSync(copy, 'utf8')).toContain("50: '#108062'");
		expect(readFileSync(join(clone, 'src/colors/tones/brand.ts'), 'utf8')).toContain("50: '#108062'");
	}, 30_000);

	it('points a role elsewhere, gives each change a new address, and stops serving the last', async () => {
		makeLibrary(THEMED);
		const p = previews();
		await ready(p);
		const first = await p.preview([{ path: 'tone.brand.50', value: '#0A6B52' }]);
		const second = await p.preview([{ path: 'palette.light.primary.main', ref: 'tone.brand.20' }]);
		if (first.state !== 'ready' || second.state !== 'ready') throw new Error('not ready');
		expect(second.base).not.toBe(first.base);
		expect((await fetch(first.base)).status).toBe(404);
		expect(scripts(second.base)).toContain('#18372F');
		expect(scripts(second.base)).not.toContain('#0A6B52');
	}, 30_000);

	it('is left by asking with no change: the commit’s own build, as it was', async () => {
		makeLibrary(THEMED);
		const p = previews();
		const base = await ready(p);
		await p.preview([{ path: 'tone.brand.50', value: '#0A6B52' }]);
		expect(await p.preview([])).toEqual({ state: 'ready', base });
	}, 30_000);

	it('builds only the newest change when several come while one builds, and answers each with it', async () => {
		makeLibrary(THEMED);
		const p = previews();
		await ready(p);
		const serve = vi.spyOn(server, 'serveFolder');
		const answers = await Promise.all(['#111111', '#222222', '#333333'].map((value) => p.preview([{ path: 'tone.brand.50', value }])));
		expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
		expect(serve.mock.calls.length).toBeLessThanOrEqual(2);
		const last = answers[0];
		if (last?.state !== 'ready') throw new Error('not ready');
		expect(scripts(last.base)).toContain('#333333');
	}, 30_000);

	it('builds the commit’s previews with T6’s tags, and with a change to see what it reaches, beside the change being tried, never in its place', async () => {
		makeLibrary(THEMED);
		const p = previews();
		await ready(p);
		const trying = await p.preview([{ path: 'tone.brand.50', value: '#0A6B52' }]);
		const tagged = await p.builtWith('tagged', withTokens([{ path: 'tone.brand.50', value: '#00015A' }]));
		if (trying.state !== 'ready' || tagged.state !== 'ready') throw new Error('not ready');
		expect(new URL(tagged.base).pathname).toMatch(/^\/tagged-/);
		const dir = join(folder, readdirSync(folder)[0]!);
		const read = (site: string) =>
			readdirSync(join(dir, site), { recursive: true })
				.map(String)
				.filter((f) => f.endsWith('.js'))
				.map((f) => readFileSync(join(dir, site, f), 'utf8'))
				.join('\n');
		expect(read('tagged')).toContain('#00015A');
		// The person's change is still what their frames show.
		expect((await fetch(trying.base)).status).toBe(200);
		expect(read('trial')).toContain('#0A6B52');
		expect(read('trial')).not.toContain('#00015A');
		// What a change reaches is built apart from both, at an address of its own each time: the tags stay served.
		const reach = await p.builtWith('reach', withTokens([{ path: 'tone.brand.50', value: '#C80000' }]));
		const again = await p.builtWith('reach', withTokens([{ path: 'tone.brand.50', value: '#C90000' }]));
		if (reach.state !== 'ready' || again.state !== 'ready') throw new Error('not ready');
		expect(new URL(again.base).pathname).toMatch(/^\/reach-/);
		expect(again.base).not.toBe(reach.base);
		expect(read('reach')).toContain('#C90000');
		expect(read('tagged')).toContain('#00015A');
		expect((await fetch(tagged.base)).status).toBe(200);
		expect((await fetch(trying.base)).status).toBe(200);
	}, 30_000);

	it('keeps a build open in which any file of the library is given in place of its own, each build at an address of its own, the copy unwritten', async () => {
		makeLibrary(THEMED);
		const p = previews();
		await ready(p);
		const opened = await p.opened('locate');
		if (opened.state !== 'open') throw new Error(JSON.stringify(opened));
		const stories = 'src/components/FSOne/FSOne.stories.tsx';
		const sass = 'src/components/FSOne/one.scss';
		try {
			// A component's own file and its stylesheet, neither of them a token's.
			const first = await opened.build(new Map([[stories, (await opened.reads.readFile(stories)).replace('One</button>', 'Uno</button>')]]));
			expect(scripts(first)).toContain('Uno');
			// The next is built with only what it gives: the story is the library's own again.
			const second = await opened.build(new Map([[sass, '$c: blue;\n.one { color: $c; }\n']]));
			expect(second).not.toBe(first);
			expect((await fetch(first)).status).toBe(404);
			expect(scripts(second)).not.toContain('Uno');
			expect(await (await fetch(`${second}entry.css`)).text()).toMatch(/\.one\{color:(blue|#00f)\}/);
		} finally {
			await opened.close();
		}
		const dir = join(folder, readdirSync(folder)[0]!);
		expect(readFileSync(join(dir, 'library', stories), 'utf8')).toContain('>One<');
		expect(readFileSync(join(dir, 'library', sass), 'utf8')).toContain('red');
	}, 60_000);

	it('keeps a CSS module’s class names its own, as the library’s build does, in the commit’s build and with a change', async () => {
		makeLibrary({
			...THEMED,
			'src/components/FSThree/FSThree.stories.tsx': story(
				'Data/FSThree',
				"import css from './three.module.css';\nimport sass from './four.module.scss';\nexport const Default = () => <i className={`${css.three} ${sass.four}`}>Three</i>;",
			),
			'src/components/FSThree/three.module.css': '.three { border-radius: 20px; }\n',
			'src/components/FSThree/four.module.scss': '$r: 4px;\n.four { padding: $r; }\n',
		});
		const p = previews();
		const base = await ready(p);
		/** What the drawn element is styled with: each class it is given, by the rule its build's stylesheet has for it. */
		const styled = async (at: string) => {
			const css = await (await fetch(`${at}entry.css`)).text();
			const root = await render(at, 'src/components/FSThree/FSThree.stories.tsx');
			const classes = (root.querySelector('i')?.className ?? '').split(' ');
			return classes.map((c) => new RegExp(`\\.${c}\\s*\\{([^}]*)\\}`).exec(css)?.[1]?.replace(/\s/g, '') ?? `no rule for "${c}"`);
		};
		expect(await styled(base)).toEqual(['border-radius:20px', 'padding:4px']);
		const opened = await p.opened('locate');
		if (opened.state !== 'open') throw new Error(JSON.stringify(opened));
		try {
			const at = await opened.build(new Map([['src/components/FSThree/three.module.css', '.three { border-radius: 4px; }\n']]));
			expect(await styled(at)).toEqual(['border-radius:4px', 'padding:4px']);
		} finally {
			await opened.close();
		}
	}, 60_000);

	it('stops serving the builds with a change made on the commit develop has left: the tags, and what a change reaches', async () => {
		makeLibrary(THEMED);
		const p = previews();
		await ready(p);
		const change = [{ path: 'tone.brand.50', value: '#00015A' }];
		const [tagged, reach] = [await p.builtWith('tagged', withTokens(change)), await p.builtWith('reach', withTokens(change))];
		if (tagged.state !== 'ready' || reach.state !== 'ready') throw new Error('not ready');
		g(upstream, 'commit', '-q', '--allow-empty', '-m', 'moved');
		g(upstream, 'push', '-q', 'origin', 'develop');
		g(clone, 'fetch', '-q', 'origin', 'develop');
		const forget = vi.spyOn(server, 'stopServing');
		await ready(p);
		// Forgotten by the server, not only emptied on disk.
		const key = (base: string) => new URL(base).pathname.split('/')[1];
		expect(forget).toHaveBeenCalledWith(key(tagged.base));
		expect(forget).toHaveBeenCalledWith(key(reach.base));
		expect((await fetch(tagged.base)).status).toBe(404);
		expect((await fetch(reach.base)).status).toBe(404);
	}, 60_000);

	it('says why a change cannot be made, and builds nothing for it', async () => {
		makeLibrary(THEMED);
		const p = previews();
		const base = await ready(p);
		expect(await p.preview([{ path: 'tone.brand.50', value: 'red' }])).toEqual({
			state: 'failed',
			error: expect.stringContaining('not a hex color'),
		});
		expect(await p.preview([])).toEqual({ state: 'ready', base });
	});
});

describe('what it says when it cannot', () => {
	it('says there is no library, no packages, or no develop', async () => {
		makeLibrary(LIBRARY, false);
		expect(await previews({ system: () => null }).preview()).toEqual({ state: 'no-library' });
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
		const snapshot = () => ({
			head: g(clone, 'rev-parse', 'HEAD'),
			status: g(clone, 'status', '--porcelain', '--ignored'),
			refs: g(clone, 'for-each-ref'),
			files: readdirSync(clone).sort(),
		});
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

/**
 * A PostCSS plugin as a utility framework is one, written here so nothing of any framework's is tested: it scans the
 * library's sources for the classes they use (`x-…`) and draws each, saying the folder it read as Tailwind does; and it
 * says what the process it runs in let it reach, and how many times it has been asked.
 */
const UTILITIES = `const { readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');
let runs = 0;
const attempt = (f) => { try { f(); return 'yes'; } catch { return 'no'; } };
module.exports = (options = {}) => ({
	postcssPlugin: 'utilities',
	Once(root, { result, postcss }) {
		// A stylesheet that asks for it ends the process, as a plugin that crashes does.
		if (root.toString().includes('@crash')) process.exit(3);
		runs++;
		// As plugins do: what it says it did, on the process's output.
		console.log('utilities: run', runs);
		const src = join(process.cwd(), 'src');
		result.messages.push({ type: 'dir-dependency', plugin: 'utilities', dir: src, parent: result.opts.from });
		const used = new Set();
		const walk = (dir) => {
			for (const e of readdirSync(dir, { withFileTypes: true }))
				if (e.isDirectory()) walk(join(dir, e.name));
				else if (/\\.tsx$/.test(e.name)) for (const c of readFileSync(join(dir, e.name), 'utf8').match(/\\bx-\\w+/g) ?? []) used.add(c);
		};
		root.walkAtRules('utilities', (rule) => {
			walk(src);
			rule.replaceWith([...used].sort().map((c) => postcss.rule({ selector: '.' + c, nodes: [postcss.decl({ prop: 'color', value: options.color })] })));
		});
		root.append(postcss.rule({ selector: '.reached', nodes: [
			postcss.decl({ prop: '--wrote', value: attempt(() => writeFileSync(join(process.cwd(), '..', 'escaped.txt'), 'x')) }),
			postcss.decl({ prop: '--home', value: attempt(() => readdirSync(homedir())) }),
			postcss.decl({ prop: '--token', value: process.env.DSNR_TEST_TOKEN ?? 'none' }),
			// As a tool looks for its configuration in the folders above the library: none there, not a failure.
			postcss.decl({ prop: '--above', value: String(require('node:fs').existsSync(join(process.cwd(), '..', '..', 'package.json'))) }),
			postcss.decl({ prop: '--runs', value: String(runs) }),
		] }));
	},
});
module.exports.postcss = true;
`;
/** A library with its own PostCSS configuration, naming that plugin, and a stylesheet its preview set-up loads. */
const WITH_POSTCSS = {
	...LIBRARY,
	'postcss.config.cjs': "module.exports = { plugins: { utilities: { color: 'rgb(1, 2, 3)' } } };\n",
	'.storybook/preview.tsx': "import '../src/styles.css';\nexport default {};\n",
	'src/styles.css': '@utilities;\n',
	'src/components/FSTwo/FSTwo.stories.tsx': story('Inputs/FSTwo', `export const Default = () => <p className="x-two">Two</p>;`),
};
const withUtilities = () =>
	write(clone, { 'node_modules/utilities/package.json': '{"name":"utilities","main":"index.js"}', 'node_modules/utilities/index.js': UTILITIES });
/** A rule of a build's stylesheet, by its selector, without its spaces; null when it has none. */
const ruleIn = (css: string, selector: string): string | null =>
	new RegExp(`${selector.replace(/[.[\]]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1]?.replace(/\s/g, '') ?? null;

describe('the library’s stylesheets, as its Storybook makes them (Phase 5.5)', () => {
	it('runs its own PostCSS configuration on them, locked to the library: no writing, no home folder, none of the app’s environment', async () => {
		makeLibrary(WITH_POSTCSS);
		withUtilities();
		// What the app's environment has (a token, say) is not the library's to read.
		vi.stubEnv('DSNR_TEST_TOKEN', 'secret');
		const css = await (await fetch(`${await ready(previews())}entry.css`)).text();
		expect(ruleIn(css, '.x-two')).toBe('color:#010203');
		expect(ruleIn(css, '.reached')).toMatch(/^--wrote:no;--home:no;--token:none;--above:false;/);
		expect(existsSync(join(folder, 'escaped.txt'))).toBe(false);
	}, 60_000);

	it('makes a stylesheet again with what a change writes in a file it read, and as the commit has it once the change is left', async () => {
		makeLibrary(WITH_POSTCSS);
		withUtilities();
		const p = previews();
		const base = await ready(p);
		const file = 'src/components/FSTwo/FSTwo.stories.tsx';
		const opened = await p.opened('reach');
		if (opened.state !== 'open') throw new Error(JSON.stringify(opened));
		try {
			const changed = await (
				await fetch(
					`${await opened.build(new Map([[file, story('Inputs/FSTwo', 'export const Default = () => <p className="x-added">Two</p>;')]]))}entry.css`,
				)
			).text();
			expect([ruleIn(changed, '.x-added'), ruleIn(changed, '.x-two')]).toEqual(['color:#010203', null]);
			const left = await (await fetch(`${await opened.build(new Map())}entry.css`)).text();
			expect([ruleIn(left, '.x-added'), ruleIn(left, '.x-two')]).toEqual([null, 'color:#010203']);
		} finally {
			await opened.close();
		}
		// The commit's own build and its copy are never written.
		expect(ruleIn(await (await fetch(`${base}entry.css`)).text(), '.x-added')).toBeNull();
		expect(readFileSync(join(folder, readdirSync(folder)[0]!, 'library', file), 'utf8')).toContain('x-two');
	}, 60_000);

	it('makes a stylesheet once while no change writes what it read, and again when one does', async () => {
		makeLibrary(WITH_POSTCSS);
		withUtilities();
		const p = previews();
		await ready(p);
		const opened = await p.opened('locate');
		if (opened.state !== 'open') throw new Error(JSON.stringify(opened));
		const runs = async (files: Map<string, string>) =>
			ruleIn(await (await fetch(`${await opened.build(files)}entry.css`)).text(), '.reached')?.match(/--runs:(\d+)/)?.[1];
		try {
			const first = await runs(new Map());
			expect(await runs(new Map([['docs/notes.md', 'Nothing a stylesheet reads.\n']]))).toBe(first);
			expect(await runs(new Map([['src/components/FSTwo/more.tsx', 'export const x = "x-more";\n']]))).not.toBe(first);
		} finally {
			await opened.close();
		}
	}, 60_000);

	it('says a process that ends, and starts it again for the next stylesheet asked, so one crash does not end the build’s life', async () => {
		makeLibrary(WITH_POSTCSS);
		withUtilities();
		const p = previews();
		await ready(p);
		const opened = await p.opened('reach');
		if (opened.state !== 'open') throw new Error(JSON.stringify(opened));
		try {
			await expect(opened.build(new Map([['src/styles.css', '@utilities;\n@crash;\n']]))).rejects.toThrow(/The library's PostCSS stopped: exit 3/);
			const css = await (await fetch(`${await opened.build(new Map())}entry.css`)).text();
			expect(ruleIn(css, '.x-two')).toBe('color:#010203');
		} finally {
			await opened.close();
		}
	}, 60_000);

	it('says a configuration that fails, by the plugin’s own words', async () => {
		makeLibrary({
			...WITH_POSTCSS,
			'postcss.config.cjs': "module.exports = { plugins: [() => { throw new Error('the theme has no colors'); }] };\n",
		});
		const built = await previews().preview();
		expect(built).toMatchObject({ state: 'failed', error: expect.stringContaining('the theme has no colors') });
	}, 60_000);

	it('builds a change to a Sass partial into every stylesheet that imports it', async () => {
		makeLibrary({
			...LIBRARY,
			'src/components/FSOne/one.scss': "@use 'colors';\n.one { color: colors.$c; }\n",
			'src/components/FSOne/_colors.scss': '$c: red;\n',
		});
		const p = previews();
		await ready(p);
		const opened = await p.opened('reach');
		if (opened.state !== 'open') throw new Error(JSON.stringify(opened));
		try {
			const css = await (await fetch(`${await opened.build(new Map([['src/components/FSOne/_colors.scss', '$c: blue;\n']]))}entry.css`)).text();
			expect(ruleIn(css, '.one')).toMatch(/^color:(blue|#00f)$/);
		} finally {
			await opened.close();
		}
	}, 60_000);
});

describe('the page', () => {
	it('lists the story files it can show, once each, and nothing per component', () => {
		const entry = previewEntry('/lib', ['src/a/A.stories.tsx', 'src/b/B.stories.tsx'], { preview: '/lib/.storybook/preview.tsx', channel: true });
		expect(entry.match(/"src\/a\/A\.stories\.tsx":/g)).toHaveLength(1);
		expect(entry.match(/"src\/b\/B\.stories\.tsx":/g)).toHaveLength(1);
		// Each by its path from the entry, so a build of any copy of the commit builds that copy's files.
		expect(entry).toContain('import("./src/a/A.stories.tsx")');
		expect(entry).toContain('"./.storybook/preview.tsx"');
		expect(entry).not.toContain('/lib/');
		// No preview set-up, no Storybook channel: neither is looked for.
		expect(previewEntry('/lib', [], { preview: null, channel: false })).not.toMatch(
			/import \* as preview|setProjectAnnotations\(preview|storybook\/preview-api/,
		);
		expect(entry).toContain("import('storybook/internal/preview-api')");
		expect(entry).not.toMatch(/FSButton|FSCard/);
	});

	it('knows which imports a build could not resolve', () => {
		expect(
			unresolved([
				{ text: 'Could not resolve "../../icons/symbols.generated"' },
				{ text: 'Could not resolve "left-pad"' },
				{ text: 'Unexpected "}"' },
			]),
		).toEqual(new Set(['../../icons/symbols.generated', 'left-pad']));
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
		expect((await fetch(`${base}%E0%A4%A`)).status).toBe(404);
		server.stopServing('k1');
		expect((await fetch(base)).status).toBe(404);
	});

	it('answers a folder’s address with its index page, at any depth, as a built site addresses its pages', async () => {
		const dir = join(home, 'site');
		write(dir, { 'index.html': '<p>home</p>', 'proj/v2/i1/index.html': '<p>review</p>', 'proj/v2/i1/page.html': '<p>page</p>' });
		const base = await server.serveFolder('k1', dir);
		expect(await (await fetch(`${base}proj/v2/i1/`)).text()).toBe('<p>review</p>');
		// The prototype's page itself, on the pages' address alone (the README's Review isolation).
		expect((await fetch(`${base}proj/v2/i1/page.html`)).status).toBe(404);
		expect(await (await fetch(`${await server.pagesOrigin()}/k1/proj/v2/i1/page.html`)).text()).toBe('<p>page</p>');
		expect((await fetch(`${base}proj/v2/`)).status).toBe(404);
	});

	it('shares its files with no other origin', async () => {
		const dir = join(home, 'site');
		write(dir, { 'entry.js': 'x' });
		const base = await server.serveFolder('k1', dir);
		for (const origin of ['null', 'https://example.com']) {
			expect((await fetch(`${base}entry.js`, { headers: { Origin: origin } })).headers.get('access-control-allow-origin')).toBeNull();
		}
	});
});

/**
 * The real library on this machine, not a fixture: every one of develop's story files builds into the page, built with
 * the clone's own packages and nothing fetched.
 */
const missing = libraryUnbuilt;

describeWith(missing, 'against the real library on origin/develop', () => {
	it('builds every story file with the clone’s own packages, and serves it', async () => {
		const real = new PrototypeServer();
		try {
			const r = await new StoryPreviews({ system: connected(REAL), folder, server: real }).preview();
			expect(r.state).toBe('ready');
			if (r.state !== 'ready') return;
			expect((await fetch(r.base)).status).toBe(200);
			const entry = await (await fetch(`${r.base}entry.js`)).text();
			expect(entry).toContain('FSButton');
		} finally {
			real.close();
		}
	}, 120_000);

	it('tries each change to a tone on one build kept open: rebuilt each time, with the Sass compiled once', async () => {
		const real = new PrototypeServer();
		try {
			const p = new StoryPreviews({ system: connected(REAL), folder, server: real });
			expect((await p.preview()).state).toBe('ready');
			const times: number[] = [];
			const after: Array<typeof counted> = [];
			for (const value of ['#0A6B52', '#0B7055', '#0C7558']) {
				const started = performance.now();
				const r = await p.preview([{ path: 'tone.pineGreen.50', value }]);
				times.push(Math.round(performance.now() - started));
				after.push({ ...counted });
				expect(r.state).toBe('ready');
			}
			// How long, for whoever reads the output; not asserted, since a busy machine's clock says nothing of the code.
			console.log(`trying a change on the real library: ${times.join(' ms, ')} ms`);
			// The first change opens the build (and opens it again if it has to set aside what is not installed); each
			// after is one rebuild of it, and a change to a tone touches no Sass, so none is compiled again.
			const [first, , last] = after as [typeof counted, typeof counted, typeof counted];
			expect(last.contexts).toBe(first.contexts);
			expect(last.rebuilds - first.rebuilds).toBe(2);
			expect(last.sass).toBe(first.sass);
		} finally {
			real.close();
		}
	}, 180_000);
});
