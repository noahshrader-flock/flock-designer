import type { DesignToken, TokenKind } from './contract';

/**
 * A primitive is in the list only once a reader can read it, so the page saying a design system does not define one is
 * always something DSNR looked for.
 */
export interface Primitive {
	category: string;
	kinds: readonly TokenKind[];
	/** For a kind several primitives share (a length), the words in a token's name that say which. */
	named?: RegExp;
	drawn: 'swatches' | 'bars' | 'corners' | 'specimens' | 'shadows' | 'table';
	/** A breakpoint is a length too, and is only shown. */
	editable?: true;
	/** As its tokens' group says each: a design system that defines some is shown to lack the rest. */
	parts?: readonly string[];
}

/** The one spelling the readers and the page share. */
export const TYPE_PARTS = { family: 'Family', size: 'Size', weight: 'Weight', lineHeight: 'Line height' } as const;
export const MOTION_PARTS = { duration: 'Duration', easing: 'Easing' } as const;
export const SHADOWS = 'Shadows';
/** The keys MUI's theme and the design token standard both write each part under. */
export const TYPE_KEYS: Record<string, string> = {
	fontFamily: TYPE_PARTS.family,
	fontSize: TYPE_PARTS.size,
	fontWeight: TYPE_PARTS.weight,
	lineHeight: TYPE_PARTS.lineHeight,
};

/** Also the order a token is matched in: the first that fits is the one. */
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

/** `null` for one the vocabulary has no place for (a width), which is left out rather than placed by guess. */
export const primitiveOf = (kind: TokenKind, name: string): string | null =>
	PRIMITIVES.find((p) => p.kinds.includes(kind) && (p.named === undefined || p.named.test(name)))?.category ?? null;

export const inOrder = <K extends string, T = DesignToken>(items: T[], key: (item: T) => K): [K, T[]][] => {
	const by = new Map<K, T[]>();
	for (const item of items) {
		const list = by.get(key(item));
		if (list) list.push(item);
		else by.set(key(item), [item]);
	}
	return [...by];
};

/** A category the vocabulary does not know comes after, in the order it first came. */
export const byPrimitive = (tokens: DesignToken[]): [string, DesignToken[]][] => {
	const rank = (category: string) => {
		const i = PRIMITIVES.findIndex((p) => p.category === category);
		return i === -1 ? PRIMITIVES.length : i;
	};
	return inOrder(tokens, (t) => t.category).sort(([a], [b]) => rank(a) - rank(b));
};

export const primitiveNamed = (category: string): Primitive | undefined => PRIMITIVES.find((p) => p.category === category);

export const drawnAs = (category: string): Primitive['drawn'] | undefined => primitiveNamed(category)?.drawn;

/** A specimen is drawn in the design system's own preview, which is built only then. */
export const drawsSpecimens = (tokens: DesignToken[]): boolean => tokens.some((t) => drawnAs(t.category) === 'specimens');

/** Every other token is shown and never edited, written or tagged. */
export const isEditable = (token: Pick<DesignToken, 'kind' | 'category'>): boolean =>
	(token.kind === 'color' || token.kind === 'dimension') && PRIMITIVES.find((p) => p.category === token.category)?.editable === true;

export const missingParts = (primitive: Primitive, tokens: DesignToken[]): string[] =>
	(primitive.parts ?? []).filter((part) => !tokens.some((t) => t.group === part));

export const listed = (words: string[]): string => (words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);

/** `found` is the tokens by primitive (`byPrimitive`). */
export const coverageOf = (
	found: [string, DesignToken[]][],
): { chips: { key: string; defined: boolean; words: string }[]; missing: { key: string; said: string }[] } => {
	const tokensOf = (category: string) => found.find(([c]) => c === category)?.[1];
	const chips = [
		...PRIMITIVES.map((p) => {
			const n = tokensOf(p.category)?.length;
			const lacks = missingParts(p, tokensOf(p.category) ?? []);
			const has = (p.parts ?? []).filter((part) => !lacks.includes(part));
			const words =
				n === undefined
					? `${p.category} not defined`
					: lacks.length > 0 && has.length > 0
						? `${p.category} ${n} · ${listed(has).toLowerCase()} only`
						: `${p.category} ${n}`;
			return { key: p.category, defined: n !== undefined, words };
		}),
		...found
			.filter(([category]) => !PRIMITIVES.some((p) => p.category === category))
			.map(([key, list]) => ({ key, defined: true, words: `${key} ${list.length}` })),
	];
	const missing = PRIMITIVES.flatMap((p) => {
		const list = tokensOf(p.category);
		if (list === undefined) return [{ key: p.category, said: p.category }];
		const parts = missingParts(p, list);
		return parts.length === 0 ? [] : [{ key: p.category, said: `${p.category} ${listed(parts).toLowerCase()}` }];
	});
	return { chips, missing };
};
