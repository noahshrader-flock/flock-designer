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
	/** The kind of value a token of it has. */
	kind: TokenKind;
	/** For a kind several primitives share (a length is spacing or a radius), the words in a token's name that say which. */
	named?: RegExp;
	/**
	 * How the Primitives page draws it: colors as swatches, spacing as bars as long as each step, a radius as a corner of its
	 * size. A category with no drawing of its own (one the vocabulary does not know) is a plain table of names and values.
	 */
	drawn: 'swatches' | 'bars' | 'corners' | 'specimens';
	/**
	 * For a primitive made of parts (typography: a family, a size, a weight, a line height), each part's name, as its tokens'
	 * group says it: a design system that defines some is shown to lack the rest (`missingParts`).
	 */
	parts?: readonly string[];
}

/** Typography's parts, as a typography token's group names them: the one spelling the readers and the page share. */
export const TYPE_PARTS = { family: 'Family', size: 'Size', weight: 'Weight', lineHeight: 'Line height' } as const;
/** Each part by the key MUI's theme and the design token standard both write it under. */
export const TYPE_KEYS: Record<string, string> = { fontFamily: TYPE_PARTS.family, fontSize: TYPE_PARTS.size, fontWeight: TYPE_PARTS.weight, lineHeight: TYPE_PARTS.lineHeight };

/** In the order they are shown, which is also the order a token is matched in: the first that fits is the one. */
export const PRIMITIVES: readonly Primitive[] = [
	{ category: 'Color', kind: 'color', drawn: 'swatches' },
	{ category: 'Typography', kind: 'font', drawn: 'specimens', parts: Object.values(TYPE_PARTS) },
	{ category: 'Spacing', kind: 'dimension', named: /spacing|space|gap|gutter|inset/i, drawn: 'bars' },
	{ category: 'Shape', kind: 'dimension', named: /radius|rounded|corner/i, drawn: 'corners' },
];

/**
 * Which primitive a token is, from its kind and its name; `null` for one the vocabulary has no place for (a font size, a
 * width, a breakpoint, a kind no primitive is yet), which is left out rather than placed by guess.
 */
export const primitiveOf = (kind: TokenKind, name: string): string | null =>
	PRIMITIVES.find((p) => p.kind === kind && (p.named === undefined || p.named.test(name)))?.category ?? null;

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
 * Whether a token of this kind can be changed in the app: a color or a length, which the controls, the writers and the
 * tagging pass are made for. Every other kind is shown and never edited, written or tagged.
 */
export const isEditable = (kind: TokenKind): boolean => kind === 'color' || kind === 'dimension';

/** The parts of a primitive its tokens leave out, in the vocabulary's order: none for one that is not made of parts. */
export const missingParts = (primitive: Primitive, tokens: DesignToken[]): string[] =>
	(primitive.parts ?? []).filter((part) => !tokens.some((t) => t.group === part));
