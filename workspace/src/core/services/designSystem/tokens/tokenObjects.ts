/**
 * Tokens written as a script's exported objects of plain values (`export const tokens = { spacing: { sm: 4 } }`), in a
 * file named for them. A value is a token only when what it is, or the words of its path, say which primitive: anything
 * else is left out, and a value worked out by code is said, never guessed.
 */
import type { DesignToken, TokenProblem } from '../../../../shared/contract';
import { DIMENSION, DURATION, hexOf, lengthParts } from '../../../../shared/tokens';
import { MOTION_PARTS, SHADOWS, TYPE_PARTS, primitiveOf } from '../../../../shared/primitives';
import { capitalize } from '../../../../shared/titleCase';
import { type Entry, exportedObjects, literal, parseObject, replaced } from './objectLiteral';
import { type TokenSource, notWhereRead, semanticFirst } from './source';

/** `tokens.ts`, `design-tokens.ts`, `theme.tokens.ts`: a script named for its tokens. */
const TOKEN_SCRIPT = /(^|\/)([^/]*[._-])?tokens?([._-][^/]*)?\.(ts|tsx|js|jsx|mjs)$/i;
const NUMBER = /^-?\d+(\.\d+)?$/;
const COLOR = /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(.*\))$/i;
/** `scales.blue[500]`, `tokens.colors.primary`, `palette['brand-pink']`: a value named by where it is. */
const POINTER = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\[\s*(?:\d+|'[^']*'|"[^"]*")\s*\])+$/;
const MODES = new Set(['light', 'dark']);

const pathOf = (pointer: string): string[] =>
	[...pointer.matchAll(/[A-Za-z_$][\w$]*|\[\s*(\d+|'[^']*'|"[^"]*")\s*\]/g)].map((m) => (m[1] ?? m[0]).replace(/^['"]|['"]$/g, ''));

/** A pointer written as the library writes one: dots for names, brackets for steps. */
const pointerTo = (path: string): string =>
	path
		.split('.')
		.map((part, i) => (i === 0 ? part : /^\d+$/.test(part) ? `[${part}]` : /^[A-Za-z_$][\w$]*$/.test(part) ? `.${part}` : `['${part}']`))
		.join('');

/** Every top-level object, exported or not: a token may point into one the file keeps to itself. */
const declaredObjects = (text: string): Map<string, Entry[]> => {
	const found = new Map<string, Entry[]>();
	for (const m of text.matchAll(/(?:^|\n)\s*(?:export\s+)?const\s+(\w+)\s*(?::[^=]+)?=\s*\{/g)) {
		const { node } = parseObject(text, (m.index ?? 0) + m[0].length - 1);
		if (node.kind === 'object') found.set(m[1] as string, node.entries);
	}
	return found;
};

interface Leaf {
	path: string[];
	written: string;
	file: string;
	line: number;
}

/** The token a value is, from what it is and the words of its path; null for one no primitive has a place for. */
const tokenOf = (path: string[], value: string): Omit<DesignToken, 'path' | 'source' | 'ref'> | null => {
	const words = path.join('.');
	const name = path[path.length - 1] as string;
	const set = path[path.length - 2] ?? name;
	const number = NUMBER.test(value);
	if (COLOR.test(value))
		return { kind: 'color', category: primitiveOf('color', words) as string, group: '', set, name, value: hexOf(value) ?? value };
	if (/shadow/i.test(words) && !number) return { kind: 'shadow', category: primitiveOf('shadow', words) as string, group: SHADOWS, set, name, value };
	if (/^cubic-bezier\(|^(ease|ease-in|ease-out|ease-in-out|linear)$/.test(value) || (/(?:^|[._])eas(?:e|ing)/i.test(words) && !number))
		return { kind: 'easing', category: primitiveOf('easing', words) as string, group: MOTION_PARTS.easing, set, name, value };
	if (DURATION.test(value) || (number && /duration|motion|transition/i.test(words)))
		return {
			kind: 'duration',
			category: primitiveOf('duration', words) as string,
			group: MOTION_PARTS.duration,
			set,
			name,
			value: number ? `${value}ms` : value,
		};
	const part = /family/i.test(words)
		? TYPE_PARTS.family
		: /line[-_]?height|leading/i.test(words)
			? TYPE_PARTS.lineHeight
			: /weight/i.test(words)
				? TYPE_PARTS.weight
				: /font[-_]?size|typography.*size/i.test(words)
					? TYPE_PARTS.size
					: null;
	if (part !== null) {
		const written = part === TYPE_PARTS.size && number ? `${value}px` : value;
		return { kind: 'font', category: primitiveOf('font', words) as string, group: part, set, name, value: written };
	}
	// A length in pixels may be written as a number, as MUI's theme and most scales write it.
	const length = DIMENSION.test(value) ? value : number ? `${value}px` : null;
	const category = length === null ? null : primitiveOf('dimension', words);
	return length === null || category === null ? null : { kind: 'dimension', category, group: category, set, name, value: length };
};

export const tokenObjects: TokenSource = {
	name: 'token scripts',
	read: async (reads, files) => {
		const leaves = new Map<string, Leaf>();
		/** A path standing for another's object: `{ ...scales }`, or `alpha: alphas`. */
		const aliases = new Map<string, string>();
		const objects = new Map<string, { file: string; entries: Entry[]; exported: boolean }>();
		for (const file of files.filter((f) => TOKEN_SCRIPT.test(f)).sort()) {
			const text = await reads.readFile(file).catch(() => null);
			if (text === null) continue;
			const exported = exportedObjects(text);
			for (const [name, entries] of declaredObjects(text)) objects.set(name, { file, entries, exported: exported.has(name) });
		}
		const walk = (entries: Entry[], path: string[], file: string) => {
			for (const e of entries) {
				if (e.spread !== undefined) {
					const from = objects.get(e.spread);
					if (from) for (const s of from.entries) if (s.key !== null) aliases.set([...path, s.key].join('.'), `${e.spread}.${s.key}`);
					continue;
				}
				if (e.key === null) continue;
				const at = [...path, e.key];
				if (e.value.kind === 'object') walk(e.value.entries, at, file);
				else if (objects.has(e.value.text)) aliases.set(at.join('.'), e.value.text);
				else leaves.set(at.join('.'), { path: at, written: e.value.text, file, line: e.line });
			}
		};
		for (const [name, { file, entries }] of objects) walk(entries, [name], file);
		/** Only what the file exports is its tokens; what it keeps to itself is there to be pointed at. */
		const exportedRoot = (path: string[]) => objects.get(path[0] as string)?.exported === true;

		/** A path as written, through what stands for another's object, to the value there. */
		const leafAt = (path: string, depth = 0): Leaf | undefined => {
			const own = leaves.get(path);
			if (own || depth > 8) return own;
			for (const [alias, to] of aliases) if (path === alias || path.startsWith(`${alias}.`)) return leafAt(to + path.slice(alias.length), depth + 1);
			return undefined;
		};

		const tokens: DesignToken[] = [];
		const problems: TokenProblem[] = [];
		const valueOf = (leaf: Leaf, depth = 0): { value: string; ref?: string } | string => {
			const plain = literal(leaf.written) ?? (NUMBER.test(leaf.written) ? leaf.written : null);
			if (plain !== null) return { value: plain };
			if (!POINTER.test(leaf.written)) return `${leaf.path.join('.')} is ${leaf.written}, worked out by code rather than written, so it is not read`;
			const target = leafAt(pathOf(leaf.written).join('.'));
			if (!target || depth > 8) return `${leaf.path.join('.')} points at ${leaf.written}, which is no value of the library's tokens`;
			const resolved = valueOf(target, depth + 1);
			if (typeof resolved === 'string')
				return /\(/.test(target.written)
					? `${leaf.path.join('.')} points at ${leaf.written}, which is worked out by code (${target.written}), so it is not read`
					: resolved;
			return { value: resolved.value, ref: target.path.join('.') };
		};
		for (const [path, leaf] of leaves) {
			if (!exportedRoot(leaf.path)) continue;
			const read = valueOf(leaf);
			if (typeof read === 'string') {
				if (/\(/.test(leaf.written) || POINTER.test(leaf.written)) problems.push({ file: leaf.file, line: leaf.line, reason: read });
				continue;
			}
			const token = tokenOf(leaf.path, read.value);
			if (token === null) continue;
			const mode = leaf.path.find((p) => MODES.has(p.toLowerCase()))?.toLowerCase() ?? 'light';
			tokens.push({
				...token,
				path,
				group: token.kind === 'color' ? capitalize(mode) : token.group,
				...(read.ref ? { ref: { path: read.ref } } : {}),
				source: { file: leaf.file, line: leaf.line },
			});
		}
		// A pointer is kept only to a token the list has; the values written plainly are the primitives, after the rest.
		const paths = new Set(tokens.map((t) => t.path));
		for (const t of tokens) if (t.ref && !paths.has(t.ref.path)) delete t.ref;
		return tokens.length === 0 ? null : { source: tokenObjects.name, tokens: semanticFirst(tokens, (t) => t.ref === undefined), problems };
	},

	edit: (text, token, to) => {
		const name = token.path.split('.').pop() as string;
		const found: Entry[] = [];
		const walk = (entries: Entry[]) => {
			for (const e of entries) {
				if (e.key === name && e.line === token.source.line && e.value.kind === 'value') found.push(e);
				if (e.value.kind === 'object') walk(e.value.entries);
			}
		};
		for (const entries of exportedObjects(text).values()) walk(entries);
		const [entry] = found;
		if (found.length !== 1 || !entry || entry.value.kind !== 'value') throw notWhereRead(token);
		const written = entry.value.text;
		if ('ref' in to) {
			if (!POINTER.test(written))
				throw new Error(`${token.path} has a value of its own, not a pointer, so it is given a value, not pointed elsewhere.`);
			const root = to.ref.split('.')[0] as string;
			if (!new RegExp(`\\b${root}\\b`).test(text))
				throw new Error(`${token.source.file} does not use ${root}, so ${token.path} cannot point at it there.`);
			return replaced(text, entry.span, pointerTo(to.ref));
		}
		// Written in the shape it had: a number stays a number (of pixels, or of milliseconds), a string keeps its quotes.
		if (NUMBER.test(written)) {
			const length = lengthParts(to.value);
			const ms = /^(-?\d+(?:\.\d+)?)ms$/.exec(to.value)?.[1];
			const bare = length?.unit === 'px' ? String(length.number) : ms;
			if (bare === undefined) throw new Error(`${token.path} is written as a number, so it cannot be ${to.value}.`);
			return replaced(text, entry.span, bare);
		}
		const quote = /^(['"`])/.exec(written)?.[1];
		if (quote === undefined) throw notWhereRead(token);
		const value = token.kind === 'color' && /^#/.test(to.value) ? to.value.toUpperCase() : to.value;
		return replaced(text, entry.span, `${quote}${value}${quote}`);
	},
};
