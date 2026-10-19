import type { DesignToken } from '../src/shared/contract';
import { PALETTE_GROUP } from '../src/shared/tokens';

export const color = (path: string, group: string, set: string, name: string, value: string, more: Partial<DesignToken> = {}): DesignToken => ({
	path,
	kind: 'color',
	category: 'Color',
	group,
	set,
	name,
	value,
	source: { file: group === PALETTE_GROUP ? `src/colors/tones/${set}.ts` : `src/colors/theme/${group.toLowerCase()}.ts`, line: 3 },
	...more,
});

export const token = (path: string, kind: DesignToken['kind'], value: string, more: Partial<DesignToken> = {}): DesignToken => ({
	path,
	kind,
	category: kind === 'color' ? 'Color' : path === 'radius' ? 'Shape' : 'Spacing',
	group: kind === 'color' ? 'Light' : path === 'radius' ? 'Radius' : 'Spacing',
	set: path.split('.').slice(-2, -1)[0] ?? path,
	name: path.split('.').pop() as string,
	value,
	source: { file: 'src/theme.ts', line: path.length },
	...more,
});
