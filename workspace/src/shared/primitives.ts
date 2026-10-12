import type { DesignToken, TokenKind } from './contract';

/**
 * The vocabulary of primitives (the Primitives plan, R1): the kinds of primitive DSNR knows, in one place, as data. The tokens
 * panel's tabs, the readers' sorting of what they find and the Primitives page all read it, so there is no second list of
 * categories anywhere. **A primitive is in the list only once a reader can read it,** so the page saying a design system
 * does not define one is always something DSNR looked for. Adding one is adding a row here, with its reader.
 */
export interface Primitive {
	/** Its name, as a tab and a section say it. */
	category: string;
	/** The kinds of value its tokens have: motion has two, a duration and an easing. */
	kinds: readonly TokenKind[];
	/**
	 * For a kind several primitives share (a length is spacing, a radius, a border or a breakpoint), the words in a token's
	 * name that say which.
	 */
	named?: RegExp;
	/**
	 * How the Primitives page draws it: colors as swatches, spacing as bars as long as each step, a radius as a corner of its
	 * size, a shadow on a box it raises, typography as a specimen, and the rest (or a category the vocabulary does not know)
	 * as a plain table of names and values.
	 */
	drawn: 'swatches' | 'bars' | 'corners' | 'specimens' | 'shadows' | 'table';
	/**
	 * Whether a token of it can be changed in the app (`isEditable`): the colors and lengths the side panel's controls, the
	 * writers and the tagging pass are made for. A breakpoint is a length too, and is only shown.
	 */
	editable?: true;
	/**
	 * For a primitive made of parts (typography: a family, a size, a weight, a line height; motion: a duration, an easing), each
	 * part's name, as its tokens' group says it: a design system that defines some is shown to lack the rest (`missingParts`).
	 */
	parts?: readonly string[];
}

/** Typography's parts, as a typography token's group names them: the one spelling the readers and the page share. */
export const TYPE_PARTS = { family: 'Family', size: 'Size', weight: 'Weight', lineHeight: 'Line height' } as const;
/** Motion's parts, as a motion token's group names them. */
export const MOTION_PARTS = { duration: 'Duration', easing: 'Easing' } as const;
/** The group every shadow is in: elevation has no parts, so its readers share this one name. */
export const SHADOWS = 'Shadows';
/** Each part by the key MUI's theme and the design token standard both write it under. */
export const TYPE_KEYS: Record<string, string> = {
	fontFamily: TYPE_PARTS.family,
	fontSize: TYPE_PARTS.size,
	fontWeight: TYPE_PARTS.weight,
	lineHeight: TYPE_PARTS.lineHeight,
};

/** In the order they are shown, which is also the order a token is matched in: the first that fits is the one. */
export const PRIMITIVES: readonly Primitive[] = [
	{ category: 'Color', kinds: ['color'], drawn: 'swatches', editable: true },
	{ category: 'Typography', kinds: ['font'], drawn: 'specimens', parts: Object.values(TYPE_PARTS) },
	{ category: 'Spacing', kinds: ['dimension'], named: /spacing|space|gap|gutter|inset/i, drawn: 'bars', editable: true },
	// Before Borders, so a border's radius is a radius.
	{ category: 'Shape', kinds: ['dimension'], named: /radius|rounded|corner/i, drawn: 'corners', editable: true },
	{ category: 'Elevation', kinds: ['shadow'], drawn: 'shadows' },
	{ category: 'Borders', kinds: ['dimension'], named: /border/i, drawn: 'table' },
	{ category: 'Breakpoints', kinds: ['dimension'], named: /breakpoint|screen/i, drawn: 'table' },
	{ category: 'Motion', kinds: ['duration', 'easing'], drawn: 'table', parts: Object.values(MOTION_PARTS) },
];

/**
 * Which primitive a token is, from its kind and its name; `null` for one the vocabulary has no place for (a width, a kind no
 * primitive is), which is left out rather than placed by guess.
 */
export const primitiveOf = (kind: TokenKind, name: string): string | null =>
	PRIMITIVES.find((p) => p.kinds.includes(kind) && (p.named === undefined || p.named.test(name)))?.category ?? null;

/** Tokens in the order they came, by `key`, keeping the first-seen order of the keys. */
export const inOrder = <K extends string>(tokens: DesignToken[], key: (t: DesignToken) => K): [K, DesignToken[]][] => {
	const by = new Map<K, DesignToken[]>();
	for (const t of tokens) {
		const list = by.get(key(t));
		if (list) list.push(t);
		else by.set(key(t), [t]);
	}
	return [...by];
};

/**
 * Tokens by primitive, in the vocabulary's order: what a screen that shows them by category draws. A category the vocabulary
 * does not know comes after, in the order it first came.
 */
export const byPrimitive = (tokens: DesignToken[]): [string, DesignToken[]][] => {
	const rank = (category: string) => {
		const i = PRIMITIVES.findIndex((p) => p.category === category);
		return i === -1 ? PRIMITIVES.length : i;
	};
	// A stable sort: categories of one rank (those the vocabulary does not know) keep the order they came in.
	return inOrder(tokens, (t) => t.category).sort(([a], [b]) => rank(a) - rank(b));
};

/**
 * Whether a token can be changed in the app: a color or a length of a primitive the vocabulary says is changed here (Color,
 * Spacing, Shape), which the controls, the writers and the tagging pass are made for. Every other token is shown and never
 * edited, written or tagged: a font, a shadow, a breakpoint (a length that is only shown), one of a category it does not know.
 */
export const isEditable = (token: Pick<DesignToken, 'kind' | 'category'>): boolean =>
	(token.kind === 'color' || token.kind === 'dimension') && PRIMITIVES.find((p) => p.category === token.category)?.editable === true;

/** The parts of a primitive its tokens leave out, in the vocabulary's order: none for one that is not made of parts. */
export const missingParts = (primitive: Primitive, tokens: DesignToken[]): string[] =>
	(primitive.parts ?? []).filter((part) => !tokens.some((t) => t.group === part));
