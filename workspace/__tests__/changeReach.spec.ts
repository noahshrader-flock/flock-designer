import { describe, expect, it } from 'vitest';
import { reachOf } from '../src/core/services/designSystem/changeReach';
import type { Drawn, Instance } from '../src/core/services/designSystem/componentTokens';
import type { ComponentValues } from '../src/shared/contract';

const BASE = {
	height: '36px',
	padding: '0px 10px 0px 10px',
	radius: '8px 8px 8px 8px',
	gap: 'normal normal',
	fontSize: '16px',
	background: 'rgb(16, 128, 98)',
	text: 'rgb(255, 255, 255)',
};
const at = (key: string, values: Partial<Instance['values']> = {}): Instance => ({ story: 'S', key, props: {}, values: { ...BASE, ...values } });
const drawn = (instances: Instance[], radii: Record<string, number> = { '8px': instances.length }): Drawn => ({
	colors: { 'rgb(16, 128, 98)': 1 },
	radii,
	spacing: {},
	component: true,
	instances,
});
const read = (cells: [string | null, string[]][]): ComponentValues => ({
	state: 'read',
	instances: 2,
	unmarked: 0,
	rows: {
		light: [
			{
				property: 'radius',
				by: 'size',
				cells: cells.map(([variant, targets]) => ({ variant, value: '', kind: 'own', tokens: [], instances: targets.length, targets })),
			},
		],
		dark: null,
	},
});
const both = (light: Drawn | null, dark: Drawn | null = light) => ({ light, dark });

describe('what a token change reaches', () => {
	it('says what changed of each component’s values, by variant, from and to, grouped, in each mode', () => {
		const before = drawn([at('sm#1'), at('sm#2'), at('lg#1')]);
		const after = drawn(
			[at('sm#1', { radius: '12px 12px 12px 12px' }), at('sm#2', { radius: '12px 12px 12px 12px' }), at('lg#1', { radius: '12px 12px 12px 12px' })],
			{ '12px': 3 },
		);
		const reach = reachOf(
			['a.stories.tsx'],
			new Map([['a.stories.tsx', both(before)]]),
			new Map([['a.stories.tsx', both(after, before)]]),
			new Map([
				[
					'a.stories.tsx',
					read([
						['sm', ['sm#1', 'sm#2']],
						['lg', ['lg#1']],
					]),
				],
			]),
		);
		expect(reach).toEqual({
			state: 'ready',
			moved: [
				{
					file: 'a.stories.tsx',
					changes: [
						{ mode: 'light', property: 'radius', variant: 'sm', from: '8px', to: '12px', instances: 2 },
						{ mode: 'light', property: 'radius', variant: 'lg', from: '8px', to: '12px', instances: 1 },
					],
					inside: false,
				},
			],
			unchanged: 0,
			notDrawn: [],
		});
	});

	it('says a component moves inside when its stories draw differently and its values do not: an inner part', () => {
		const before = drawn([at('k#1')], { '8px': 2, '0px': 3 });
		const after = drawn([at('k#1')], { '12px': 2, '0px': 3 });
		const reach = reachOf(
			['input.stories.tsx'],
			new Map([['input.stories.tsx', both(before)]]),
			new Map([['input.stories.tsx', both(after)]]),
			new Map(),
		);
		expect(reach.state === 'ready' && reach.moved).toEqual([{ file: 'input.stories.tsx', changes: [], inside: true }]);
	});

	it('counts those it does not move, and says apart those that did not draw, as the library has it or with the change', () => {
		const same = drawn([at('x#1')]);
		const files = ['same.stories.tsx', 'unseen.stories.tsx', 'broke.stories.tsx'];
		const reach = reachOf(
			files,
			new Map([
				['same.stories.tsx', both(same)],
				['unseen.stories.tsx', both(null)],
				['broke.stories.tsx', both(same)],
			]),
			new Map([
				['same.stories.tsx', both(same)],
				['unseen.stories.tsx', both(same)],
				['broke.stories.tsx', both(null)],
			]),
			new Map(),
		);
		expect(reach).toEqual({ state: 'ready', moved: [], unchanged: 1, notDrawn: ['unseen.stories.tsx', 'broke.stories.tsx'] });
	});

	it('says a change only in dark as dark’s, and a value said as the Values say it: short, and a clear colour as none', () => {
		const light = drawn([at('k#1')]);
		const darkBefore = drawn([at('k#1', { background: 'rgb(43, 180, 138)', padding: '4px 4px 4px 4px' })]);
		const darkAfter = drawn([at('k#1', { background: 'rgba(0, 0, 0, 0)', padding: '6px 6px 6px 6px' })]);
		const reach = reachOf(
			['a.stories.tsx'],
			new Map([['a.stories.tsx', both(light, darkBefore)]]),
			new Map([['a.stories.tsx', both(light, darkAfter)]]),
			new Map(),
		);
		expect(reach.state === 'ready' && reach.moved[0]?.changes).toEqual([
			{ mode: 'dark', property: 'padding', variant: null, from: '4px', to: '6px', instances: 1 },
			{ mode: 'dark', property: 'background', variant: null, from: 'rgb(43, 180, 138)', to: 'none', instances: 1 },
		]);
	});
});
