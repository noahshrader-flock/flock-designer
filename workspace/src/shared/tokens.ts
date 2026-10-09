/**
 * What a change does to the library's tokens, worked out once (T3 of the design system plan, decisions 19, 26 and 27):
 * the list as it reads with a change made, which tokens point at one, and how two colors contrast. The panel shows what
 * this says, and the writer checks what it wrote against it (`tokenEdits.ts`), so what is seen and what is built cannot
 * disagree.
 */
import type { DesignToken, TokenEdit } from './contract';

/** A color a change can give: a hex, with an opacity when it has eight digits. */
export const HEX_COLOR = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A CSS length the panel shows as a dimension: `8px`, `0.25rem`, `1.5em`. */
export const DIMENSION = /^-?\d*\.?\d+(px|rem|em)$/;

/** Whether `value` is one a token of this kind can be given. */
export const fitsKind = (kind: DesignToken['kind'], value: string): boolean => (kind === 'color' ? HEX_COLOR : DIMENSION).test(value);

/**
 * Where a token is written. Two tokens can be written in one place: a palette both modes spread in (FUI's shared roles)
 * is one line read as a Light token and a Dark one, so a change to either is a change to both.
 */
export const placeOf = (t: DesignToken): string => `${t.source.file}:${t.source.line}:${t.set}.${t.name}`;

/** The other tokens written where `token` is: what a change to it also changes. */
export const writtenWith = (tokens: DesignToken[], token: DesignToken): DesignToken[] => tokens.filter((t) => t !== token && placeOf(t) === placeOf(token));

/**
 * The tokens as they read with `edits` made: each one edited (and any written in the same place), and every one that
 * points at one, however far. A token given a value of its own no longer points at anything; one pointed elsewhere keeps
 * the opacity written after its pointer.
 */
export const withEdits = (tokens: DesignToken[], edits: TokenEdit[]): DesignToken[] => {
	const byPath = new Map(tokens.map((t) => [t.path, t]));
	const at = new Map(edits.flatMap((e) => (byPath.has(e.path) ? [[placeOf(byPath.get(e.path) as DesignToken), e] as const] : [])));
	const edited = new Map(tokens.flatMap((t) => (at.has(placeOf(t)) ? [[t.path, at.get(placeOf(t)) as TokenEdit] as const] : [])));
	const done = new Map<string, DesignToken>();
	const resolve = (t: DesignToken, depth: number): DesignToken => {
		const known = done.get(t.path);
		if (known) return known;
		const edit = edited.get(t.path);
		let next = t;
		if (edit && 'value' in edit) {
			const { ref: _pointer, ...own } = t;
			next = { ...own, value: edit.value };
		} else {
			const ref = edit ? { path: edit.ref, ...(t.ref?.alpha ? { alpha: t.ref.alpha } : {}) } : t.ref;
			const target = ref && byPath.get(ref.path);
			// A pointer is followed a few steps at most, as the readers follow one.
			if (ref && target && depth < 6) next = { ...t, ref, value: `${resolve(target, depth + 1).value}${ref.alpha?.toUpperCase() ?? ''}` };
		}
		done.set(t.path, next);
		return next;
	};
	return tokens.map((t) => resolve(t, 0));
};

/** The tokens written as a pointer to `path`: what a change to it moves along with it. */
export const pointingAt = (tokens: DesignToken[], path: string): DesignToken[] => tokens.filter((t) => t.ref?.path === path);

/**
 * The color a token is read with, when the library says, either way round: a role's `main` and its `contrastText` (MUI's
 * pair), `--x` and `--x-foreground` (shadcn's), in the same mode.
 */
export const contrastPartner = (token: DesignToken, tokens: DesignToken[]): DesignToken | undefined => {
	if (token.kind !== 'color') return undefined;
	const sameMode = (t: DesignToken) => t !== token && t.kind === 'color' && t.group === token.group;
	const role = token.name === 'main' ? 'contrastText' : token.name === 'contrastText' ? 'main' : null;
	if (role !== null) return tokens.find((t) => sameMode(t) && t.set === token.set && t.name === role);
	const base = /^(.+)-foreground$/.exec(token.name)?.[1];
	return tokens.find((t) => sameMode(t) && t.name === (base ?? `${token.name}-foreground`));
};

/** Whether a token is the one read on top in its pair (`contrastText`, `--x-foreground`): its pair's row says the ratio. */
export const isForeground = (token: DesignToken): boolean => token.name === 'contrastText' || token.name.endsWith('-foreground');

/** The least contrast WCAG asks of body text (level AA). */
export const AA_TEXT = 4.5;

/** A hex color's relative luminance, as WCAG defines it. */
const luminance = (hex: string): number => {
	const [r, g, b] = [1, 3, 5].map((i) => {
		const c = parseInt(hex.slice(i, i + 2), 16) / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** A color with nothing seen through it: six hex digits, or eight ending in full opacity. */
const opaque = (value: string): boolean => HEX_COLOR.test(value) && (value.length === 7 || /ff$/i.test(value));

/**
 * The WCAG contrast ratio of two colors, rounded down to one decimal so a ratio shown as passing does pass; `null` when
 * either is not an opaque hex, whose contrast depends on what is under it.
 */
export const contrastRatio = (a: string, b: string): number | null => {
	if (!opaque(a) || !opaque(b)) return null;
	const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
	return Math.floor(((light + 0.05) / (dark + 0.05)) * 10) / 10;
};
