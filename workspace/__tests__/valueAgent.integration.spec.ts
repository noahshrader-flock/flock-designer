import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reachOf } from '../src/core/services/designSystem/changeReach';
import type { Built, Drawn } from '../src/core/services/designSystem/componentTokens';
import { libraryCommit, systemReads } from '../src/core/services/designSystem/designLibrary';
import { DESIGN_SYSTEM_CODE, ValueAgent, type Written } from '../src/core/services/designSystem/valueAgent';
import type { ComponentValues, TriedValue } from '../src/shared/contract';
import { g, settledAnswer } from './fixtures';

/**
 * The agent writing a value where there is nothing to swap, and making one follow a token (Phase 4.5, 4.6), against a real
 * clone of a small library, so the copy it works in and what it changed are git's. The agent is a stand-in that writes as
 * a run would; the library is drawn by a rule this test knows: the Badge's radius is its stylesheet's, or the theme's
 * shape when the stylesheet reads it.
 */
const BADGE = 'src/Badge/Badge.stories.tsx';
const CSS = 'src/Badge/Badge.module.css';
const THEME = 'src/utils/theme.ts';
const LIBRARY = {
	[THEME]: 'export const createFSTheme = () => {\n  const shape = { borderRadius: 8 };\n  return createTheme({ spacing: 8, shape });\n};\n',
	[CSS]: '.badge {\n  border-radius: 8px;\n}\n',
	[BADGE]: "export default { title: 'Data/Badge' };\nexport const Default = () => null;\n",
};

let home: string;
let clone: string;
let tasks: string[];
/** What each run was given to read and never change. */
let readable: string[][];
let copies: { hasPackages: boolean }[];
/** What each run of the stand-in agent writes into the copy it is run in, in turn, and what it says. */
let runs: { files: Record<string, string>; said: string; held?: Promise<void>; remove?: string[] }[];

const write = (root: string, files: Record<string, string>) => {
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
};
/** How the library draws: the Badge's radius from its stylesheet, or the theme's shape where the stylesheet reads it. */
const draw = (files: Record<string, string>): Drawn => {
	const css = files[CSS] ?? '';
	const shape = /borderRadius: (\d+)/.exec(files[THEME] ?? '')?.[1];
	const radius = css.includes('var(--shape)') ? `${shape}px` : (/border-radius: ([^;]+);/.exec(css)?.[1] ?? '0px');
	return {
		colors: {},
		radii: { [radius]: 1 },
		spacing: {},
		component: true,
		instances: [{ story: 'Default', key: 'Badge#1', props: { size: 'sm' }, values: { radius: `${radius} ${radius} ${radius} ${radius}` } }],
	};
};
const values: Map<string, ComponentValues> = new Map([
	[
		BADGE,
		{
			state: 'read',
			instances: 1,
			unmarked: 0,
			rows: {
				light: [
					{ property: 'radius', by: null, cells: [{ variant: null, value: '8px', kind: 'own', tokens: [], instances: 1, targets: ['Badge#1'] }] },
				],
				dark: null,
			},
		},
	],
]);
const built: Built = {
	files: new Map(),
	values,
	accessibility: new Map(),
	order: [BADGE],
	reading: { tags: { edits: [], colors: new Map(), sizes: [], unmarked: 0 }, tokens: [], tagged: null },
};
const index = { key: 'commit:', commit: 'commit', built };
const system = () => ({ id: 'acme/ui', name: 'Acme', repository: 'acme/ui', root: clone, folder: '', branch: 'develop' });
const drawings = (files: Record<string, string>) => new Map([[BADGE, { light: draw(files), dark: null }]]);

const agent = () =>
	new ValueAgent({
		system,
		tokens: {
			drawn: async () => {
				const commit = (await libraryCommit(clone, 'develop')) as string;
				return { state: 'ready', ...index, key: `${commit}:`, commit };
			},
			asIs: async () => drawings(LIBRARY),
			reachWith: async (_index, files) => {
				const given = Object.fromEntries(await files(await systemReads(system(), (await libraryCommit(clone, 'develop')) as string)));
				const after = drawings({ ...LIBRARY, ...given });
				return { reach: reachOf(built.order, drawings(LIBRARY), after, values), after };
			},
		},
		run: async (cwd, task, readOnly) => {
			tasks.push(task);
			readable.push(readOnly);
			copies.push({ hasPackages: existsSync(join(cwd, 'node_modules')) });
			const next = runs.shift();
			if (!next) return { ok: false, said: 'no run' };
			await next.held;
			write(cwd, next.files);
			for (const gone of next.remove ?? []) rmSync(join(cwd, gone));
			return { ok: true, said: next.said };
		},
		readStandard: async (path) => (path === DESIGN_SYSTEM_CODE ? '# Changing a design system’s code\n\nIts own source only.' : ''),
	});
/** What `a` has written for `t` once it is no longer writing it. */
const settled = async (a: ValueAgent, t: TriedValue): Promise<Written | null> => {
	const drawn = { ...index, key: `${await libraryCommit(clone, 'develop')}:` };
	return settledAnswer(
		() => a.of(drawn, BADGE, t),
		(w) => w?.state === 'writing',
	);
};
/** Has `a` write `t`, and waits until it has. */
const written = async (a: ValueAgent, t: TriedValue): Promise<Written | null> => {
	await a.write(BADGE, t);
	return settled(a, t);
};

const SIX: TriedValue = { property: 'radius', value: '6px 6px 6px 6px', targets: ['Badge#1'] };
const FOLLOW: TriedValue = { property: 'radius', value: '8px 8px 8px 8px', targets: ['Badge#1'], follows: 'radius' };

beforeEach(() => {
	home = mkdtempSync(join(tmpdir(), 'dsnr-value-agent-'));
	const upstream = join(home, 'upstream');
	clone = join(home, 'ui');
	g(home, 'init', '-q', '--bare', '-b', 'develop', join(home, 'remote.git'));
	g(home, 'init', '-q', '-b', 'develop', upstream);
	write(upstream, LIBRARY);
	g(upstream, 'add', '-A');
	g(upstream, 'commit', '-q', '-m', 'library');
	g(upstream, 'remote', 'add', 'origin', join(home, 'remote.git'));
	g(upstream, 'push', '-q', 'origin', 'develop');
	g(home, 'clone', '-q', join(home, 'remote.git'), clone);
	tasks = [];
	readable = [];
	copies = [];
	mkdirSync(join(clone, 'node_modules', '@mui', 'material'), { recursive: true });
	runs = [];
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe('the agent writing a value where there is nothing to swap (4.5)', () => {
	it('is asked with the facts and the standard, in a copy of the library, and what it wrote is taken once it reads back', async () => {
		runs = [
			{ files: { [CSS]: '.badge {\n  border-radius: 6px;\n}\n' }, said: 'Done.\nChanged: src/Badge/Badge.module.css:2\nWhy: Its radius is its own.' },
		];
		const a = agent();
		const w = await written(a, SIX);
		expect(w).toEqual({
			state: 'written',
			files: new Map([[CSS, '.badge {\n  border-radius: 6px;\n}\n']]),
			places: [{ file: CSS, line: 2, written: '', writes: '' }],
			said: 'Its radius is its own.',
		});
		expect(tasks).toHaveLength(1);
		expect(tasks[0]).toContain("Make Badge's radius draw 6px 6px 6px 6px instead of 8px.");
		expect(tasks[0]).toContain(`drawn by its stories in ${BADGE}: Default (size=sm)`);
		expect(tasks[0]).toContain('Its own source only.');
		// Given the packages the library installs, to read and never to change: not copied in, where it could write them.
		expect(readable).toEqual([[join(clone, 'node_modules')]]);
		expect(copies[0]?.hasPackages).toBe(false);
		expect(tasks[0]).toContain(`The packages it installs are in ${join(clone, 'node_modules')}, to read and never to change.`);
		// The person's clone is as it was.
		expect(g(clone, 'status', '--porcelain').trim()).toBe('');
	});

	it('tells it once what it drew when it does not read back, and takes the second when it does', async () => {
		runs = [
			{ files: { [CSS]: '.badge {\n  border-radius: 7px;\n}\n' }, said: 'Why: first.' },
			{ files: { [CSS]: '.badge {\n  border-radius: 6px;\n}\n' }, said: 'Why: second.' },
		];
		expect(await written(agent(), SIX)).toMatchObject({ state: 'written', said: 'second.' });
		expect(tasks[1]).toContain('DSNR drew its stories with your change: it draws 7px 7px 7px 7px, not 6px 6px 6px 6px.');
	});

	it('refuses, in words, what does not read back twice, what is not the design system’s own code, and no change', async () => {
		runs = [
			{ files: { [CSS]: '.badge {\n  border-radius: 7px;\n}\n' }, said: '' },
			{ files: { [CSS]: '.badge {\n  border-radius: 5px;\n}\n' }, said: '' },
		];
		expect(await written(agent(), SIX)).toEqual({
			state: 'refused',
			why: 'Written by the agent, it draws 5px 5px 5px 5px, not 6px 6px 6px 6px, so it is not saved.',
		});
		runs = [{ files: { [CSS]: '.badge {\n  border-radius: 6px;\n}\n', [BADGE]: '// changed\n' }, said: '' }];
		expect(await written(agent(), SIX)).toMatchObject({
			state: 'refused',
			why: expect.stringMatching(/not the design system's own code to change \(src\/Badge\/Badge\.stories\.tsx\)/),
		});
		// Deleting a file of its own is not a value's change.
		runs = [{ files: { [CSS]: '.badge {\n  border-radius: 6px;\n}\n' }, said: '', remove: [THEME] }];
		expect(await written(agent(), SIX)).toMatchObject({ state: 'refused', why: expect.stringMatching(/\(src\/utils\/theme\.ts\)/) });
		runs = [{ files: {}, said: 'Why: it is MUI’s.' }];
		expect(await written(agent(), SIX)).toEqual({ state: 'refused', why: 'The agent changed nothing: it is MUI’s.' });
	});

	it('runs once for a value asked again while it writes, and again once refused', async () => {
		let release: () => void = () => undefined;
		runs = [{ files: {}, said: '', held: new Promise<void>((go) => (release = go)) }];
		const a = agent();
		await a.write(BADGE, SIX);
		await a.write(BADGE, SIX);
		release();
		expect(await settled(a, SIX)).toMatchObject({ state: 'refused' });
		expect(tasks).toHaveLength(1);
		runs = [{ files: { [CSS]: '.badge {\n  border-radius: 6px;\n}\n' }, said: '' }];
		expect(await written(a, SIX)).toMatchObject({ state: 'written' });
		expect(tasks).toHaveLength(2);
	});
});

describe('the agent making a value follow a token (4.6)', () => {
	it('is taken when the value draws as it did, and with the token changed draws the token', async () => {
		runs = [{ files: { [CSS]: '.badge {\n  border-radius: var(--shape);\n}\n' }, said: 'Why: it reads the shape.' }];
		expect(await written(agent(), FOLLOW)).toMatchObject({ state: 'written', said: 'it reads the shape.' });
		expect(tasks[0]).toContain("Make Badge's radius follow the design system's token radius (8px now) instead of its own value");
	});

	it('is refused, in words, when it looks the same but does not follow the token', async () => {
		const same = { files: { [CSS]: '.badge {\n  border-radius: 8px; /* the radius */\n}\n' }, said: '' };
		runs = [same, same];
		expect(await written(agent(), FOLLOW)).toEqual({
			state: 'refused',
			why: 'Written by the agent, it does not follow radius: with it at 15px, it draws 8px 8px 8px 8px, so it is not saved.',
		});
	});
});
