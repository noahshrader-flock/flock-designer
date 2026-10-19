import type { DesignToken } from '../src/shared/contract';
import { isEditable } from '../src/shared/primitives';
import { PALETTE_GROUP, lengthParts } from '../src/shared/tokens';

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

/** A length moved a little in its own unit: three pixels, or a quarter of a rem. */
const moved = (value: string): string | null => {
	const parts = lengthParts(value);
	if (parts?.unit === 'px') return `${parts.number + 3}px`;
	if (parts?.unit === 'rem') return `${parts.number + 0.25}rem`;
	return null;
};

/** A color and a length a library can change (a spacing or a radius), each to a value it does not have: an edit any can take. */
export const aColorAndALength = (tokens: DesignToken[]): { path: string; value: string }[] => {
	const colorToken = tokens.find((t) => t.kind === 'color' && t.ref === undefined && isEditable(t));
	const lengthToken = tokens.find((t) => t.kind === 'dimension' && t.ref === undefined && isEditable(t) && moved(t.value) !== null);
	return [
		...(colorToken ? [{ path: colorToken.path, value: colorToken.value.toUpperCase() === '#123456' ? '#654321' : '#123456' }] : []),
		...(lengthToken ? [{ path: lengthToken.path, value: moved(lengthToken.value) as string }] : []),
	];
};
