import { describe, expect, it } from 'vitest';
import { token } from './tokenFixtures';
import { AskInWords, type AskInWordsDeps } from '../src/main/services/askInWords';
import type { Built } from '../src/main/services/componentTokens';
import type { ComponentTokens as Answer, ValueRow } from '../src/shared/contract';

/**
 * Asking in words (Phase 6): words made the changes the controls make, by an agent stood in for here, which answers as this
 * test says. What is checked is what the app does with what it is told: the facts it gives, and the rules every answer passes.
 */
const TOKENS = [
	token('tone.green.50', 'color', '#108062'),
	token('tone.green.60', 'color', '#0C6B52'),
	token('palette.light.primary.main', 'color', '#108062', { ref: { path: 'tone.green.50' } }),
	token('radius', 'dimension', '8px'),
	// Shown, never changed: not one the agent is told of.
	token('font.body', 'font', 'Inter', { category: 'Typography' }),
];
const ROWS: ValueRow[] = [
	{
		property: 'height',
		by: 'size',
		cells: [
			{ variant: 'sm', value: '28px', kind: 'own', tokens: [], instances: 2, targets: ['Default\u0000sm\u00001'] },
			{ variant: 'md', value: '36px', kind: 'own', tokens: [], instances: 2, targets: ['Default\u0000md\u00001'] },
		],
	},
	{ property: 'padding', by: null, cells: [{ variant: null, value: '8px 16px 8px 16px', kind: 'own', tokens: [], instances: 4, targets: ['p'] }] },
	{
		property: 'background',
		by: null,
		cells: [{ variant: null, value: 'rgb(16, 128, 98)', kind: 'token', tokens: ['palette.light.primary.main'], instances: 4, targets: ['b'] }],
	},
	// Its own, and the radius token's value: one it could follow.
	{ property: 'radius', by: null, cells: [{ variant: null, value: '8px 8px 8px 8px', kind: 'own', tokens: [], instances: 4, targets: ['r'] }] },
];
const built = { reading: { tags: { edits: [], colors: new Map(), sizes: [], unmarked: 0 }, tokens: TOKENS, tagged: null } } as unknown as Built;
const read: Answer = {
	state: 'ready',
	uses: [],
	sharedWith: {},
	notTokens: [],
	derived: 0,
	accessibility: null,
	values: { state: 'read', instances: 4, unmarked: 0, rows: { light: ROWS, dark: null } },
};
const BUTTON = 'src/components/FSButton/FSButton.stories.tsx';
const NONE = { edits: [], tried: [] };

/** What is asked of the agent, each time, and an agent that answers each time with the next of `answers`. */
const asking = (...answers: string[]) => {
	const tasks: string[] = [];
	const deps: AskInWordsDeps = {
		tokens: { drawn: async () => ({ state: 'ready', key: 'c:', commit: 'c', built }), of: async () => read },
		run: async (_cwd, task) => {
			tasks.push(task);
			return { ok: true, said: answers[tasks.length - 1] ?? '' };
		},
	};
	return { ask: new AskInWords(deps), tasks };
};

describe('asking in words (Phase 6)', () => {
	it('gives the agent the words, the tokens that can be changed, the component’s values by name, and what is being tried', async () => {
		const { ask, tasks } = asking('{ "tokens": [{ "path": "radius", "value": "10px" }], "said": "Rounder." }');
		await ask.ask(BUTTON, 'make it rounder', {
			edits: [{ path: 'tone.green.50', value: '#118063' }],
			tried: [{ property: 'height', value: '30px', targets: ['Default\u0000sm\u00001'] }],
		});
		const [task] = tasks as [string];
		expect(task).toContain('"make it rounder"');
		expect(task).toContain('- palette.light.primary.main (');
		expect(task).toContain('points at tone.green.50');
		expect(task).not.toContain('font.body');
		expect(task).toContain('- v1: Height (height), size sm, 28px, its own');
		expect(task).toContain('- v4: ');
		expect(task).toMatch(/- v4: .*the token palette\.light\.primary\.main/);
		// What it could follow, as its control offers it: only a value of its own, the same as the token's.
		expect(task).toMatch(/- v5: Radius .*its own; could follow radius$/m);
		expect(task).not.toMatch(/- v4: .*could follow/);
		// Named as the component, never by a guess at its name from its file.
		expect(task).not.toContain('FSButton');
		// What is being tried, named as its values are, so "a little more" is from there.
		expect(task).toContain('- tone.green.50: #118063');
		expect(task).toContain('- v1: 30px');
	});

	it('makes the answer the changes the controls make: a token edit, and a value on the instances its cell names, in its full form', async () => {
		const { ask } = asking(
			JSON.stringify({
				tokens: [{ path: 'palette.light.primary.main', ref: 'tone.green.60' }],
				values: [
					{ cell: 'v1', value: '30px' },
					{ cell: 'v3', value: '8px  12px' },
					{ cell: 'v4', value: '#aa0000' },
				],
				said: 'A warmer primary, and a taller small size.',
			}),
		);
		expect(await ask.ask(BUTTON, 'warmer, and the small one taller', NONE)).toEqual({
			edits: [{ path: 'palette.light.primary.main', ref: 'tone.green.60' }],
			values: [
				{ property: 'height', value: '30px', targets: ['Default\u0000sm\u00001'] },
				{ property: 'padding', value: '8px 12px 8px 12px', targets: ['p'] },
				{ property: 'background', value: '#AA0000', targets: ['b'] },
			],
			said: 'A warmer primary, and a taller small size.',
		});
	});

	it('makes a value follow a token as its control does: one it offers, drawn as it is until the agent writes it', async () => {
		const { ask } = asking('{ "values": [{ "cell": "v5", "follows": "radius", "value": "99px" }], "said": "Follows the radius." }');
		expect((await ask.ask(BUTTON, 'use the shared radius', NONE)).values).toEqual([
			{ property: 'radius', value: '8px 8px 8px 8px', targets: ['r'], follows: 'radius' },
		]);
	});

	it('gives an answer that breaks a rule back once, with why, and takes the one that does not', async () => {
		const { ask, tasks } = asking(
			'{ "tokens": [{ "path": "radius", "value": "#ff0000" }] }',
			'Here it is: { "tokens": [{ "path": "radius", "value": "12px" }], "said": "Rounder." }',
		);
		expect(await ask.ask(BUTTON, 'rounder', NONE)).toMatchObject({ edits: [{ path: 'radius', value: '12px' }] });
		expect(tasks[1]).toMatch(/Your answer was not taken, because #ff0000 is not a length, so radius cannot be it\. Answer again/);
	});

	it('says why when the answer still breaks the rules, and passes on the agent’s own refusal as it said it', async () => {
		const wrong = '{ "values": [{ "cell": "v1", "value": "tall" }] }';
		await expect(asking(wrong, wrong).ask.ask(BUTTON, 'taller', NONE)).rejects.toThrow(
			'The words could not be made a change: height is a length in pixels, every part, not tall.',
		);
		const refused = asking('{ "refused": "A loading state is new code, not a value." }');
		await expect(refused.ask.ask(BUTTON, 'add a loading state', NONE)).rejects.toThrow('A loading state is new code, not a value.');
		expect(refused.tasks).toHaveLength(1);
	});

	it('refuses what no control makes: a value of a component it was not asked on, a cell it does not have, a token it does not have, nothing', async () => {
		const answer = (o: unknown) => JSON.stringify(o);
		const cases: [string | null, unknown, string][] = [
			[null, { values: [{ cell: 'v1', value: '30px' }] }, 'only tokens are changed here'],
			[BUTTON, { values: [{ property: 'height', value: '30px' }] }, 'a value names its cell'],
			[BUTTON, { values: [{ cell: 'v9', value: '30px' }] }, "v9 is not one of the component's values"],
			[BUTTON, { tokens: [{ path: 'font.body', value: '12px' }] }, 'The library has no token font.body.'],
			[BUTTON, { values: [{ cell: 'v5', follows: 'tone.green.50' }] }, 'v5 cannot follow tone.green.50'],
			[BUTTON, { values: [{ cell: 'v4', follows: 'palette.light.primary.main' }] }, 'v4 cannot follow palette.light.primary.main'],
			[BUTTON, { values: [{ cell: 'v1', value: '1.5rem' }] }, 'height is a length in pixels, every part, not 1.5rem'],
			[BUTTON, { tokens: [], values: [] }, 'The words changed nothing the controls change.'],
		];
		for (const [file, said, why] of cases) await expect(asking(answer(said), answer(said)).ask.ask(file, 'x', NONE)).rejects.toThrow(why);
	});

	it('asks of the design system alone with no component’s values, and waits for its components to be drawn', async () => {
		const { ask, tasks } = asking('{ "tokens": [{ "path": "tone.green.50", "value": "#128064" }] }');
		expect(await ask.ask(null, 'a little warmer', NONE)).toMatchObject({
			edits: [{ path: 'tone.green.50', value: '#128064' }],
			values: [],
			said: 'Changed as asked.',
		});
		expect(tasks[0]).not.toContain("'s values, as its stories draw them");
		// Nor any values to answer with: only its tokens are changed there.
		expect(tasks[0]).not.toContain('"values"');
		const waiting = new AskInWords({
			tokens: { drawn: async () => ({ state: 'building' }), of: async () => read },
			run: async () => ({ ok: true, said: '' }),
		});
		await expect(waiting.ask(null, 'x', NONE)).rejects.toThrow('still being read');
	});
});
