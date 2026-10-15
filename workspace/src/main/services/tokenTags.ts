/**
 * The tags T6 draws every story with (decision 29): each token that can be changed given a value nothing else has, a color
 * by its number and a length by a prime number of pixels; and how a drawn value is read back as the token it is. Used by
 * which tokens a component draws with (`componentTokens.ts`) and by its drawn values (`componentValues.ts`).
 */
import type { DesignToken, TokenEdit } from '../../shared/contract';
import { isEditable } from '../../shared/primitives';
import { PX_PER_REM, lengthParts, placeOf } from '../../shared/tokens';

/** A tag's blue, the same for every color tag: its red and green are the token's number. */
const TAG_BLUE = 0x5a;

/**
 * The size tag after `px`: the next prime. Size tags are primes from 13, so a whole multiple of up to 8 of one is never a
 * multiple of another, and none is a size a library is likely to write by hand; there are as many as a library has lengths.
 */
const FIRST_SIZE_TAG = 13;
const nextSizeTag = (px: number): number => {
	const isPrime = (k: number) => Array.from({ length: Math.floor(Math.sqrt(k)) - 1 }, (_, i) => i + 2).every((d) => k % d !== 0);
	let k = px + 1;
	while (!isPrime(k)) k++;
	return k;
};
/** The largest multiple of a size tag read as that token: a theme's spacing is used up to a few times over. */
const MOST_MULTIPLE = 8;

export interface Tags {
	edits: TokenEdit[];
	/** How many of the tokens that could be changed are lengths no tag can be given (in `em` or `%`): what they draw reads as no token. */
	unmarked: number;
	/** A color tag (`#00015A`), and a size tag in pixels, to the token it was given to. */
	colors: Map<string, string>;
	sizes: { px: number; path: string }[];
}

/**
 * A tag for every token: one edit for each place a token is written (a role both modes share is one place), a color by
 * its number, a length by a prime number of pixels (of a rem's sixteenths for one written in rem). A length in `em`, whose
 * pixels depend on where it is used, is left untagged.
 */
export const tagsFor = (tokens: DesignToken[]): Tags => {
	const edits: TokenEdit[] = [];
	const colors = new Map<string, string>();
	const sizes: Tags['sizes'] = [];
	const places = new Set<string>();
	let unmarked = 0;
	for (const t of tokens) {
		// Only what can be changed is tagged: a tag is a change, and a font or a shadow is shown, never changed.
		if (!isEditable(t) || places.has(placeOf(t))) continue;
		places.add(placeOf(t));
		if (t.kind === 'color') {
			const n = colors.size + 1;
			const value = `#${[(n >> 8) & 255, n & 255, TAG_BLUE].map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
			colors.set(value, t.path);
			edits.push({ path: t.path, value });
			continue;
		}
		const unit = lengthParts(t.value)?.unit;
		if (unit !== 'px' && unit !== 'rem') {
			unmarked++;
			continue;
		}
		const px = sizes.length === 0 ? FIRST_SIZE_TAG : nextSizeTag((sizes[sizes.length - 1] as { px: number }).px);
		sizes.push({ px, path: t.path });
		edits.push({ path: t.path, value: unit === 'px' ? `${px}px` : `${px / PX_PER_REM}rem` });
	}
	return { edits, colors, sizes, unmarked };
};

/** A computed color (`rgb(0, 1, 90)`, `rgba(0, 1, 90, 0.4)`) as the tag it would be, whatever its opacity. */
export const asTag = (color: string): string | null => {
	const m = /^rgba?\((\d+), (\d+), (\d+)/.exec(color);
	if (!m || Number(m[3]) !== TAG_BLUE) return null;
	return `#${[m[1], m[2], m[3]].map((c) => Number(c).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
};

/** The size tag a computed size (`26px`) is a whole multiple of, if any. */
export const sizeToken = (value: string, sizes: Tags['sizes']): string | null => {
	const px = Math.abs(Number(/^(-?[\d.]+)px$/.exec(value)?.[1] ?? NaN));
	if (!Number.isFinite(px) || px === 0) return null;
	return sizes.find((s) => px % s.px === 0 && px / s.px <= MOST_MULTIPLE)?.path ?? null;
};

/** Nothing worth saying: no color, no size, or a gap left as CSS has it (`normal`). */
export const isNothing = (value: string): boolean => ['rgba(0, 0, 0, 0)', 'transparent', '0px', 'normal', 'auto', ''].includes(value);
