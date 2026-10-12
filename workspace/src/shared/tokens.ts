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
export const DIMENSION = /^(-?\d*\.?\d+)(px|rem|em)$/;

/** A CSS duration: `150ms`, `0.2s`. */
export const DURATION = /^-?\d*\.?\d+m?s$/;

/** A length's number and unit (`8px` is 8 and `px`), or null when it is not one. */
export const lengthParts = (value: string): { number: number; unit: 'px' | 'rem' | 'em' } | null => {
	const m = DIMENSION.exec(value);
	return m ? { number: Number(m[1]), unit: m[2] as 'px' | 'rem' | 'em' } : null;
};

/** How many pixels a rem is, as the browser's default font size makes it. */
export const PX_PER_REM = 16;

/** A length in pixels, as it is drawn; null for one that is not a length, or whose size depends on where it is used (`em`). */
export const pixelsOf = (value: string): number | null => {
	const length = lengthParts(value);
	if (length === null || length.unit === 'em') return null;
	return length.unit === 'rem' ? length.number * PX_PER_REM : length.number;
};

/** A token as a person names it: `primary main`, `pineGreen 50`. */
export const nameOf = (t: DesignToken): string => `${t.set} ${t.name}`;

/** A token named with where it is shown: `Light primary main`, `Tones pineGreen 50`, `Radius base` (not `Radius radius base`). */
export const labelOf = (t: DesignToken): string => (t.set.toLowerCase() === t.group.toLowerCase() ? `${t.group} ${t.name}` : `${t.group} ${nameOf(t)}`);

/** What a token reads as, in a word: the token it points at (`pineGreen 40`), or its value (`12px`). */
export const readsAs = (t: DesignToken, byPath: Map<string, DesignToken>): string => {
	const pointed = t.ref && byPath.get(t.ref.path);
	return pointed ? nameOf(pointed) : t.value;
};

/**
 * A change in words, one line for each token edited: `Light primary main: pineGreen 50 → pineGreen 40`. What the panel lists,
 * and what a save's commit and its pull request say.
 */
export const describeChange = (tokens: DesignToken[], edits: TokenEdit[]): string[] => {
	const read = new Map(tokens.map((t) => [t.path, t]));
	const changed = new Map(withEdits(tokens, edits).map((t) => [t.path, t]));
	return edits.flatMap((e) => {
		const was = read.get(e.path);
		const now = changed.get(e.path);
		return was && now ? [`${labelOf(was)}: ${readsAs(was, read)} → ${readsAs(now, changed)}`] : [];
	});
};

/** Whether two changes are the same, whatever their order: the same tokens, each pointed at or given the same. */
export const sameChange = (a: TokenEdit[], b: TokenEdit[]): boolean => {
	const key = (edits: TokenEdit[]) =>
		edits
			.map((e) => `${e.path}\u0000${'ref' in e ? `ref ${e.ref}` : `value ${e.value}`}`)
			.sort()
			.join('\n');
	return key(a) === key(b);
};

/** Whether `value` is one a token of this kind can be given. */
export const fitsKind = (kind: DesignToken['kind'], value: string): boolean => (kind === 'color' ? HEX_COLOR.test(value) : kind === 'dimension' ? DIMENSION.test(value) : false);

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
	// Each edit by the place it changes, so every token written there takes it.
	const editAt = new Map<string, TokenEdit>();
	for (const e of edits) {
		const t = byPath.get(e.path);
		if (t) editAt.set(placeOf(t), e);
	}
	const done = new Map<string, DesignToken>();
	const resolve = (t: DesignToken, depth: number): DesignToken => {
		const known = done.get(t.path);
		if (known) return known;
		const edit = editAt.get(placeOf(t));
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
