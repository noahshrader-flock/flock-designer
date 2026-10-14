/**
 * What a change does to the library's tokens, worked out once (T3 of the design system plan, decisions 19, 26 and 27):
 * the list as it reads with a change made, which tokens point at one, and how two colors contrast. The panel shows what
 * this says, and the writer checks what it wrote against it (`tokenEdits.ts`), so what is seen and what is built cannot
 * disagree.
 */
import type { Catalog, DesignToken, TokenEdit } from './contract';
import { plural } from './plural';
import { inOrder } from './primitives';
import { type DeclaredTarget, textContrast } from './wcag';

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

/**
 * A token as a person names it, **as its library writes it**: its set and name joined the way its path joins them. A
 * family and a step the library keeps apart (`tone.pineGreen.50`, `palette.light.primary.main`) read with a space
 * (`pineGreen 50`, `primary main`); one it writes as a single name (`--pine-green-50`, `--pine_green_50`, `--pineGreen50`)
 * reads as that name, so what is shown is what is in the file. A set that is its own name is said once (`background`).
 */
export const nameOf = (t: DesignToken): string => {
	if (t.set === t.name) return t.name;
	if (!t.path.endsWith(t.name)) return `${t.set} ${t.name}`;
	const before = t.path.slice(0, t.path.length - t.name.length);
	if (before.endsWith(t.set)) return `${t.set}${t.name}`;
	const joiner = before.slice(-1);
	return (joiner === '-' || joiner === '_') && before.slice(0, -1).endsWith(t.set) ? `${t.set}${joiner}${t.name}` : `${t.set} ${t.name}`;
};

/** A token named with where it is shown: `Light primary main`, `Tones pineGreen 50`, `Radius base` (not `Radius radius base`). */
export const labelOf = (t: DesignToken): string =>
	t.set.toLowerCase() === t.group.toLowerCase() ? `${t.group} ${t.name}` : `${t.group} ${nameOf(t)}`;

/** A token's role and variant, without saying a word twice: `primary.main`, `background` (a role whose name is its set). */
export const roleOf = (t: DesignToken): string => (t.set === t.name ? t.name : `${t.set}.${t.name}`);

/** What a token is called with where it is: `Light · primary.main`, `Dark · background`; the title of its control. */
export const tokenTitle = (t: DesignToken): string => `${t.group} · ${roleOf(t)}`;

/** Where a token's family is: its group (the theme a role is in, the palette) and its set (`primary`, `pineGreen`). */
export const familyOf = (t: DesignToken): string => `${t.group}/${t.set}`;

/** The group a reader gives a library's palette (the families its roles are made from), when the library names one. */
export const PALETTE_GROUP = 'Tones';

/**
 * The color families that are the palette: those the reader puts in the palette group (an unused one too), and any whose
 * steps a role points at, which finds the scales of a library that does not say (CSS variables, a token file). A step a
 * role points at is a palette's only if it has nothing it points at itself: a role that is an alias of another is a role.
 * From the tokens as the library has them, so a change that points a role elsewhere does not move a family.
 */
export const paletteFamilies = (library: DesignToken[]): Set<string> => {
	const byPath = new Map(library.map((t) => [t.path, t]));
	const families = new Set(library.filter((t) => t.kind === 'color' && t.group === PALETTE_GROUP).map(familyOf));
	for (const t of library) {
		const target = t.ref && byPath.get(t.ref.path);
		if (target && target.kind === 'color' && target.ref === undefined && familyOf(target) !== familyOf(t)) families.add(familyOf(target));
	}
	return families;
};

/** One semantic color across the themes: its role's set, its name, and the token it is in each theme (none where it has none). */
export interface SemanticRow {
	set: string;
	name: string;
	cells: (DesignToken | undefined)[];
}

/**
 * The semantic colors lined up by theme (`themes`, each a group, in the order they come): a column for each, a row for each
 * role's variant, those of a set together. A role whose name is its set (`--primary`) is a plain row in `flat`, since a
 * heading over each would say the same word twice. However many themes a library has, there is a column for each.
 */
export interface SemanticTable {
	themes: string[];
	flat: SemanticRow[];
	sets: { set: string; rows: SemanticRow[] }[];
}

export const semanticTable = (tokens: DesignToken[]): SemanticTable => {
	const themes = [...new Set(tokens.map((t) => t.group))];
	const rows = new Map<string, SemanticRow>();
	for (const t of tokens) {
		const key = `${t.set}\u0000${t.name}`;
		let row = rows.get(key);
		if (!row) rows.set(key, (row = { set: t.set, name: t.name, cells: themes.map(() => undefined) }));
		row.cells[themes.indexOf(t.group)] = t;
	}
	const sets = new Map<string, SemanticRow[]>();
	const flat: SemanticRow[] = [];
	for (const row of rows.values()) {
		if (row.set === row.name) flat.push(row);
		else sets.set(row.set, [...(sets.get(row.set) ?? []), row]);
	}
	return { themes, flat, sets: [...sets].map(([set, inSet]) => ({ set, rows: inSet })) };
};

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

/** The most edits a change is: more is not a person's change to a design system. */
export const MOST_EDITS = 500;

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
export const fitsKind = (kind: DesignToken['kind'], value: string): boolean =>
	kind === 'color' ? HEX_COLOR.test(value) : kind === 'dimension' ? DIMENSION.test(value) : false;

/**
 * Where a token is written. Two tokens can be written in one place: a palette both modes spread in (FUI's shared roles)
 * is one line read as a Light token and a Dark one, so a change to either is a change to both.
 */
export const placeOf = (t: DesignToken): string => `${t.source.file}:${t.source.line}:${t.set}.${t.name}`;

/** The other tokens written where `token` is: what a change to it also changes. */
export const writtenWith = (tokens: DesignToken[], token: DesignToken): DesignToken[] =>
	tokens.filter((t) => t !== token && placeOf(t) === placeOf(token));

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

/** The two views of a category drawn as swatches: the roles by theme, and the palette they are made from. */
export type ColorView = 'semantic' | 'palette';

/** What a token is, in words, for a search to look through: what it points at too, as it is named on screen (`pineGreen 50`). */
export const searchText = (t: DesignToken, target?: DesignToken): string =>
	[t.path, t.group, t.set, t.name, t.value, t.ref?.path ?? '', target ? nameOf(target) : ''].join(' ').toLowerCase();

/** A role's variant, whichever theme it is in: what a search keeps together, so a match in one theme keeps the others'. */
const roleKey = (t: DesignToken): string => `${t.set}\u0000${t.name}`;

/**
 * A category's tokens as the tokens panel shows them, in the app and in VS Code. For colors (`colors`): the roles, or the
 * palette they point into (`isPalette`), as `view` asks when it has both (`choose`), else the one it has; null for any
 * other category. Then what `query` finds, by `searchText`; in the roles, one found in a theme is kept in every theme.
 */
export const tokensShown = (
	tokens: DesignToken[],
	{
		colors,
		isPalette,
		view,
		query,
		target,
	}: {
		colors: boolean;
		isPalette: (t: DesignToken) => boolean;
		view: ColorView;
		query: string;
		target: (t: DesignToken) => DesignToken | undefined;
	},
): { choose: boolean; view: ColorView | null; shown: DesignToken[] } => {
	const semantic = colors ? tokens.filter((t) => !isPalette(t)) : [];
	const palette = colors ? tokens.filter(isPalette) : [];
	const choose = semantic.length > 0 && palette.length > 0;
	const shownView: ColorView | null = !colors ? null : choose ? view : semantic.length > 0 ? 'semantic' : 'palette';
	const pool = shownView === 'semantic' ? semantic : shownView === 'palette' ? palette : tokens;
	const q = query.trim().toLowerCase();
	if (q === '') return { choose, view: shownView, shown: pool };
	const found = pool.filter((t) => searchText(t, target(t)).includes(q));
	if (shownView !== 'semantic') return { choose, view: shownView, shown: found };
	const roles = new Set(found.map(roleKey));
	return { choose, view: shownView, shown: pool.filter((t) => roles.has(roleKey(t))) };
};

const HEX6 = /^#[0-9a-f]{6}$/i;

/** A color a person typed, as a token is given it: a six-digit hex, in capitals, with the opacity it had kept; else null. */
export const typedHex = (typed: string, alpha: string): string | null => (HEX6.test(typed.trim()) ? `${typed.trim().toUpperCase()}${alpha}` : null);

/** Whether what is in a hex field is a whole hex yet, so a color picker can show it. */
export const isHex = (typed: string): boolean => HEX6.test(typed);

/**
 * A length's slider (T3): its number and unit now, and its range, from nothing to twice what the design system has (`asRead`),
 * at least a useful span; whole pixels, or eighths of a rem.
 */
export const lengthRange = (asRead: DesignToken, value: string): { number: number; unit: 'px' | 'rem' | 'em'; max: number; step: number } => {
	const { number, unit } = lengthParts(value) ?? { number: 0, unit: 'px' };
	const px = unit === 'px';
	return { number, unit, max: Math.max(px ? 32 : 2, (lengthParts(asRead.value)?.number ?? number) * 2), step: px ? 1 : 0.125 };
};

/**
 * The families a role can be pointed into, each with its steps: the palette's families in its target's own group (a
 * theme, the palette), and the one it points into now. Another token's pointer goes only within its own group.
 */
export const scaleFamilies = (
	shown: DesignToken[],
	token: DesignToken,
	target: DesignToken,
	isPalette: (t: DesignToken) => boolean,
): [string, DesignToken[]][] =>
	inOrder(
		shown.filter((t) => t.kind === token.kind && t.group === target.group && (isPalette(t) || t.set === target.set)),
		(t) => t.set,
	);

/** A color's own six hex digits, and the opacity written after them (two more, or nothing), as its hex field edits them apart. */
export const hexAndAlpha = (value: string): { hex: string; alpha: string } => ({
	hex: value.slice(0, 7),
	alpha: value.length === 9 ? value.slice(7) : '',
});

/** An opacity written after a tone (`66`), as a person reads it (`40%`). */
const opacity = (alpha: string): string => `${Math.round((parseInt(alpha, 16) / 255) * 100)}%`;

/** What a token points at, as a person reads it: `pineGreen 50`, and the opacity written after it (`at 40%`). */
export const pointsAt = (token: DesignToken, target: DesignToken): string =>
	`${nameOf(target)}${token.ref?.alpha ? ` at ${opacity(token.ref.alpha)}` : ''}`;

/** A pair's contrast: the color read with this one, the ratio between them, and whether it is enough for text. */
export interface PairContrast {
	partner: DesignToken;
	ratio: number;
	flag: boolean;
	words: string;
}

/**
 * The contrast a color leaves with the one it is read with (its pair: `main` and `contrastText`), among the tokens as
 * changed (`shown`), and whether that is enough for text at the design system's target (`textContrast`); null when it has
 * no pair. What a token's control says, in the app and in VS Code.
 */
export const pairContrast = (
	token: DesignToken,
	{ shown, accessibility }: { shown: DesignToken[]; accessibility: DeclaredTarget },
): PairContrast | null => {
	const partner = contrastPartner(token, shown);
	const ratio = partner ? contrastRatio(token.value, partner.value) : null;
	return partner && ratio !== null ? { partner, ratio, ...textContrast(ratio, accessibility) } : null;
};

/** The contrast a token's row and its theme's swatch say: its pair's, on the one read under the other only, not on both. */
export const rowContrast: typeof pairContrast = (token, changes) => (isForeground(token) ? null : pairContrast(token, changes));

/** What a change being tried keeps once the design system is read again (a sync): the edits of tokens it still has. */
export const editsKept = (edits: TokenEdit[], catalog: Catalog): TokenEdit[] => {
	const paths = new Set(catalog.state === 'ready' ? catalog.tokens.tokens.map((t) => t.path) : []);
	return edits.every((e) => paths.has(e.path)) ? edits : edits.filter((e) => paths.has(e.path));
};

/**
 * What changing a token reaches, as its control says it, in the app and in VS Code: the roles that point at it, by name
 * (or that none does, for a step of a family roles point into: it can be changed freely), and the tokens written in the
 * same place, which change with it. Null when it reaches neither.
 */
export const reachOf = (
	token: DesignToken,
	{ shown, isPointedInto }: { shown: DesignToken[]; isPointedInto: (token: DesignToken) => boolean },
): { used: { says: string; who: string } | null; also: string | null } | null => {
	const users = pointingAt(shown, token.path);
	const also = writtenWith(shown, token);
	const pointedInto = users.length > 0 || isPointedInto(token);
	if (!pointedInto && also.length === 0) return null;
	return {
		used: pointedInto
			? { says: users.length > 0 ? `Used by ${plural(users.length, 'role')}` : 'Not used by any role', who: users.map(labelOf).join('\n') }
			: null,
		also: also.length > 0 ? `Also changes ${also.map(labelOf).join(', ')}: written in one place.` : null,
	};
};
