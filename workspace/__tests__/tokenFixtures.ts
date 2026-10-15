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
