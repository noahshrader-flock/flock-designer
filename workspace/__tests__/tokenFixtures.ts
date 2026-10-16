import type { DesignToken } from '../src/shared/contract';
import { PALETTE_GROUP } from '../src/shared/tokens';

/** A color token as a reader gives one: where it is written follows its group (the tones' files, a theme's file). */
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

/**
 * A token as a reader gives one, by its path, kind and value: a colour in Light, a length in Shape when its path is the
 * radius and in Spacing otherwise, its set and name from its path, written in the theme's file.
 */
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
