/**
 * The panel shows what this says, and the writer checks what it wrote against it (`tokenEdits.ts`), so what is seen and
 * what is built cannot disagree.
 */
import type { Catalog, DesignToken, TokenEdit } from './contract';
import { plural } from './plural';
import { inOrder } from './primitives';
import { type DeclaredTarget, textContrast } from './wcag';
import { themeLabel } from './prototypeTheme';
import { type Rgb, contrastOf } from './contrast';

/** Every reader groups a theme's colours by the theme they are for (`Light`, `Dark`). */
export const isDark = (t: Pick<DesignToken, 'group'>): boolean => t.group === themeLabel('dark');

/** Eight digits carry an opacity. */
export const HEX_COLOR = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A color as a stylesheet or a script may write one: a hex of any length a browser takes, or a color function. */
export const COLOR_WRITTEN = /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(.*\))$/i;

const SHORT_HEX = /^#[0-9a-f]{3,4}$/i;

/** A hex written short or whole, as its whole upper-case form; null for anything that is not a hex. */
export const wholeHex = (written: string): string | null => (SHORT_HEX.test(written) || HEX_COLOR.test(written) ? hexOf(written) : null);

/** As written, but a short hex spelled out whole (`#000` is `#000000`): for a reader that keeps what the library wrote. */
export const hexSpelledOut = (written: string): string => (SHORT_HEX.test(written) ? (hexOf(written) as string) : written);

export const DIMENSION = /^(-?\d*\.?\d+)(px|rem|em)$/;

export const DURATION = /^-?\d*\.?\d+m?s$/;

export const lengthParts = (value: string): { number: number; unit: 'px' | 'rem' | 'em' } | null => {
	const m = DIMENSION.exec(value);
	return m ? { number: Number(m[1]), unit: m[2] as 'px' | 'rem' | 'em' } : null;
};

/** The browser's default font size. */
export const PX_PER_REM = 16;

/** Null for one that is not a length, or whose size depends on where it is used (`em`). */
export const pixelsOf = (value: string, perRem = PX_PER_REM): number | null => {
	const length = lengthParts(value);
	if (length === null || length.unit === 'em') return null;
	return length.unit === 'rem' ? length.number * perRem : length.number;
};

/**
 * As its library writes it, so what is shown is what is in the file: `tone.pineGreen.50` reads `pineGreen 50`, but
 * `--pine-green-50` stays one name.
 */
export const nameOf = (t: DesignToken): string => {
	if (t.set === t.name) return t.name;
	if (!t.path.endsWith(t.name)) return `${t.set} ${t.name}`;
	const before = t.path.slice(0, t.path.length - t.name.length);
	if (before.endsWith(t.set)) return `${t.set}${t.name}`;
	const joiner = before.slice(-1);
	return (joiner === '-' || joiner === '_') && before.slice(0, -1).endsWith(t.set) ? `${t.set}${joiner}${t.name}` : `${t.set} ${t.name}`;
};

/** Never says a word twice: `Radius base`, not `Radius radius base`; `Radius`, not `Radius radius`. */
export const labelOf = (t: DesignToken): string => {
	if (t.set.toLowerCase() !== t.group.toLowerCase()) return `${t.group} ${nameOf(t)}`;
	return t.name.toLowerCase() === t.group.toLowerCase() ? t.group : `${t.group} ${t.name}`;
};

export const roleOf = (t: DesignToken): string => (t.set === t.name ? t.name : `${t.set}.${t.name}`);

export const tokenTitle = (t: DesignToken): string => `${t.group} · ${roleOf(t)}`;

export const familyOf = (t: DesignToken): string => `${t.group}/${t.set}`;

export const PALETTE_GROUP = 'Tones';

/**
 * A step that itself points at something is not palette (a role aliasing another is a role). Read from the library's
 * own tokens, so a change that points a role elsewhere does not move a family.
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

/** `cells` follow `themes`, undefined where a theme has none. */
export interface SemanticRow {
	set: string;
	name: string;
	cells: (DesignToken | undefined)[];
}

/** A role whose name is its set (`--primary`) is a plain row in `flat`, since a heading over it would say the word twice. */
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

export const readsAs = (t: DesignToken, byPath: Map<string, DesignToken>): string => {
	const pointed = t.ref && byPath.get(t.ref.path);
	return pointed ? nameOf(pointed) : t.value;
};

export const describeChange = (tokens: DesignToken[], edits: TokenEdit[]): string[] => {
	const read = new Map(tokens.map((t) => [t.path, t]));
	const changed = new Map(withEdits(tokens, edits).map((t) => [t.path, t]));
	return edits.flatMap((e) => {
		const was = read.get(e.path);
		const now = changed.get(e.path);
		return was && now ? [`${labelOf(was)}: ${readsAs(was, read)} → ${readsAs(now, changed)}`] : [];
	});
};

/** More is not a person's change to a design system. */
export const MOST_EDITS = 500;

/** Whatever their order. */
export const sameChange = (a: TokenEdit[], b: TokenEdit[]): boolean => {
	const key = (edits: TokenEdit[]) =>
		edits
			.map((e) => `${e.path}\u0000${'ref' in e ? `ref ${e.ref}` : `value ${e.value}`}`)
			.sort()
			.join('\n');
	return key(a) === key(b);
};

export const fitsKind = (kind: DesignToken['kind'], value: string): boolean =>
	kind === 'color' ? HEX_COLOR.test(value) : kind === 'dimension' ? DIMENSION.test(value) : false;

/**
 * Two tokens can be written in one place (a palette both modes spread in is one line read as Light and Dark), so a change
 * to either is a change to both.
 */
export const placeOf = ({ source: { file, line, from }, set, name }: DesignToken): string =>
	`${file}:${line}${from ? `:${from.file}:${from.line}` : ''}:${set}.${name}`;

export const writtenWith = (tokens: DesignToken[], token: DesignToken): DesignToken[] =>
	tokens.filter((t) => t !== token && placeOf(t) === placeOf(token));

/**
 * Every token that points at one edited follows it. A token given a value of its own points at nothing; one pointed
 * elsewhere keeps the opacity written after its pointer.
 */
export const withEdits = (tokens: DesignToken[], edits: TokenEdit[]): DesignToken[] => {
	const byPath = new Map(tokens.map((t) => [t.path, t]));
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

export const pointingAt = (tokens: DesignToken[], path: string): DesignToken[] => tokens.filter((t) => t.ref?.path === path);

/** Either way round, in the same mode: `main` and `contrastText` (MUI's pair), `--x` and `--x-foreground` (shadcn's). */
export const contrastPartner = (token: DesignToken, tokens: DesignToken[]): DesignToken | undefined => {
	if (token.kind !== 'color') return undefined;
	const sameMode = (t: DesignToken) => t !== token && t.kind === 'color' && t.group === token.group;
	const role = token.name === 'main' ? 'contrastText' : token.name === 'contrastText' ? 'main' : null;
	if (role !== null) return tokens.find((t) => sameMode(t) && t.set === token.set && t.name === role);
	const base = /^(.+)-foreground$/.exec(token.name)?.[1];
	return tokens.find((t) => sameMode(t) && t.name === (base ?? `${token.name}-foreground`));
};

/** Its pair's row says the ratio. */
export const isForeground = (token: DesignToken): boolean => token.name === 'contrastText' || token.name.endsWith('-foreground');

const rgbOf = (hex: string): Rgb => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

const opaque = (value: string): boolean => HEX_COLOR.test(value) && (value.length === 7 || /ff$/i.test(value));

/**
 * Rounded down to one decimal so a ratio shown as passing does pass; `null` when either is not an opaque hex, whose
 * contrast depends on what is under it.
 */
export const contrastRatio = (a: string, b: string): number | null => {
	if (!opaque(a) || !opaque(b)) return null;
	return Math.floor(contrastOf(rgbOf(a), rgbOf(b)) * 10) / 10;
};

export type ColorView = 'semantic' | 'palette';

const searchText = (t: DesignToken, target?: DesignToken): string =>
	[t.path, t.group, t.set, t.name, t.value, t.ref?.path ?? '', target ? nameOf(target) : ''].join(' ').toLowerCase();

const roleKey = (t: DesignToken): string => `${t.set}\u0000${t.name}`;

/**
 * `view` is honoured only when colors have both roles and palette (`choose`); null for any other category. In the roles,
 * one found in a theme is kept in every theme.
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

/** The opacity it had is kept. */
export const typedHex = (typed: string, alpha: string): string | null => (HEX6.test(typed.trim()) ? `${typed.trim().toUpperCase()}${alpha}` : null);

export const isHex = (typed: string): boolean => HEX6.test(typed);

/** From nothing to twice what it `was`, at least a useful span, and never short of what it is now. */
export const lengthSpan = (value: string, was: string): { number: number; unit: 'px' | 'rem' | 'em'; max: number; step: number } => {
	const { number, unit } = lengthParts(value) ?? { number: 0, unit: 'px' };
	const px = unit === 'px';
	return { number, unit, max: Math.max(px ? 32 : 2, (lengthParts(was)?.number ?? number) * 2, number), step: px ? 1 : 0.125 };
};

/** Where clear, or no border, starts when a colour of its own is tried: white, as the page behind it. */
export const NONE_STARTS_AS = '#FFFFFF';

/**
 * From the browser's computed form (`rgba(0, 0, 0, 0.5)`): two more digits only for an opacity less than whole. A hex is
 * given back as it is, a short one (`#000`, `#f0a8`) written out whole.
 */
export const hexOf = (color: string): string | null => {
	if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color)) return color.toUpperCase();
	if (/^#[0-9a-f]{3,4}$/i.test(color)) return `#${[...color.slice(1)].map((d) => d + d).join('')}`.toUpperCase();
	const m = /^rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)$/.exec(color);
	if (!m) return null;
	const byte = (n: number) => Math.round(n).toString(16).padStart(2, '0');
	const alpha = m[4] === undefined || Number(m[4]) >= 1 ? '' : byte(Number(m[4]) * 255);
	return `#${byte(Number(m[1]))}${byte(Number(m[2]))}${byte(Number(m[3]))}${alpha}`.toUpperCase();
};

/** Only within its target's own group: the palette's families there, and the one it points into now. */
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

export const hexAndAlpha = (value: string): { hex: string; alpha: string } => ({
	hex: value.slice(0, 7),
	alpha: value.length === 9 ? value.slice(7) : '',
});

const opacity = (alpha: string): string => `${Math.round((parseInt(alpha, 16) / 255) * 100)}%`;

/** One that is not a color the browser computes (`none`) is given back as it is. */
export const colorAsRead = (color: string): string => {
	const hex = hexOf(color);
	if (hex === null) return color;
	const { hex: own, alpha } = hexAndAlpha(hex);
	return alpha === '' ? own : `${own} · ${opacity(alpha)}`;
};

export const pointsAt = (token: DesignToken, target: DesignToken): string =>
	`${nameOf(target)}${token.ref?.alpha ? ` at ${opacity(token.ref.alpha)}` : ''}`;

export interface PairContrast {
	partner: DesignToken;
	ratio: number;
	flag: boolean;
	words: string;
}

/** Among the tokens as changed (`shown`); null when it has no pair. */
export const pairContrast = (
	token: DesignToken,
	{ shown, accessibility }: { shown: DesignToken[]; accessibility: DeclaredTarget },
): PairContrast | null => {
	const partner = contrastPartner(token, shown);
	const ratio = partner ? contrastRatio(token.value, partner.value) : null;
	return partner && ratio !== null ? { partner, ratio, ...textContrast(ratio, accessibility) } : null;
};

/** Said on the one read under the other only, not on both. */
export const rowContrast: typeof pairContrast = (token, changes) => (isForeground(token) ? null : pairContrast(token, changes));

/** The same list, not a copy, when every edit is kept. */
export const editsKept = (edits: TokenEdit[], catalog: Catalog): TokenEdit[] => {
	const paths = new Set(catalog.state === 'ready' ? catalog.tokens.tokens.map((t) => t.path) : []);
	return edits.every((e) => paths.has(e.path)) ? edits : edits.filter((e) => paths.has(e.path));
};

/** Null for one the library declares itself. */
export const declaredBy = ({ source: { from } }: Pick<DesignToken, 'source'>): string | null => {
	if (!from) return null;
	const pkg = /(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(from.file)?.[1] ?? from.file;
	return `Declared by ${pkg}. A change is written here as an override; the token itself is that package’s to change.`;
};

/** Null when no role points at it or into its family, and nothing is written in the same place. */
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
