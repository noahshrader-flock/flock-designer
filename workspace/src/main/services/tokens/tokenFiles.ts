/**
 * Tokens kept in design token files, the standard JSON format (the Design Tokens Community Group's, which Style
 * Dictionary and Tokens Studio write): a token is an object with a `$value`, its kind the `$type` it has or its group
 * has. Colors, lengths whose name says spacing or radius, and typography (a family, a weight, a size named as one, a
 * typography token as each of its parts) are read; other kinds (shadows, durations) are left out until a primitive reads
 * them. A value that names another token (`{color.red.500}`) is that token's value, and
 * points at it. Each token's line is exact: the file is read a second time for where things are, by the same reader the
 * theme files use (JSON is an object literal too). A change is written in the token's `$value`, in the shape it had.
 */
import type { DesignToken, TokenProblem } from '../../../shared/contract';
import { DIMENSION, lengthParts } from '../../../shared/tokens';
import { type Entry, parseObject, replaced } from './objectLiteral';
import { TYPE_KEYS, TYPE_PARTS, primitiveOf } from '../../../shared/primitives';
import { type TokenSource, capitalized, notWhereRead, semanticFirst } from './source';

const TOKEN_FILE = /(\.tokens\.json|(^|\/)(design-)?tokens?\.json|(^|\/)(design-)?tokens\/.+\.json)$/i;

interface Raw {
	path: string[];
	type: string | undefined;
	value: unknown;
	file: string;
	line: number;
}

/** Every object entry of a token file, however deep, by its path joined with dots: where each thing in it is written. */
const entriesOf = (text: string): Map<string, Entry> => {
	const at = new Map<string, Entry>();
	const open = text.indexOf('{');
	const walk = (entries: Entry[], path: string[]) => {
		for (const e of entries) {
			if (e.key === null) continue;
			at.set([...path, e.key].join('.'), e);
			if (e.value.kind === 'object') walk(e.value.entries, [...path, e.key]);
		}
	};
	const { node } = parseObject(text, open);
	if (open >= 0 && node.kind === 'object') walk(node.entries, []);
	return at;
};

/** A value that names another token: `{color.red.500}` names `color.red.500`. */
const POINTER = /^\{([^{}]+)\}$/;

/** A length as written: `"4px"`, or `{ "value": 4, "unit": "px" }`. */
const lengthOf = (value: unknown): string | null => {
	if (typeof value === 'string') return DIMENSION.test(value) ? value : null;
	const v = value as { value?: unknown; unit?: unknown } | null;
	return typeof v?.value === 'number' && typeof v.unit === 'string' && DIMENSION.test(`${v.value}${v.unit}`) ? `${v.value}${v.unit}` : null;
};

/** A family as written: a name, or a list of them, which a stylesheet writes with commas. */
const familyOf = (value: unknown): string | null =>
	typeof value === 'string' ? value : Array.isArray(value) && value.every((v) => typeof v === 'string') ? value.join(', ') : null;
/** A weight or a line height as written: a number, or a word (`bold`), or a length for a line height. */
const plainOf = (value: unknown): string | null => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value : null);

/** How each part of typography is read from a token file: a family as a name or a list, a size as a length, the rest as written. */
const READ_PART: Record<string, (v: unknown) => string | null> = {
	[TYPE_PARTS.family]: familyOf,
	[TYPE_PARTS.size]: (v) => lengthOf(v),
	[TYPE_PARTS.weight]: plainOf,
	[TYPE_PARTS.lineHeight]: plainOf,
};

export const tokenFiles: TokenSource = {
	name: 'token files',
	read: async (reads, files) => {
		const raws = new Map<string, Raw>();
		const problems: TokenProblem[] = [];
		for (const file of files.filter((f) => TOKEN_FILE.test(f)).sort()) {
			const text = await reads.readFile(file).catch(() => null);
			if (text === null) continue;
			let json: unknown;
			try {
				json = JSON.parse(text);
			} catch {
				problems.push({ file, reason: `${file} is not JSON, so it is not read` });
				continue;
			}
			const at = entriesOf(text);
			const lineOf = (path: string[]) => at.get(path.join('.'))?.line ?? 1;
			const walk = (node: unknown, path: string[], type: string | undefined) => {
				if (node === null || typeof node !== 'object') return;
				const o = node as Record<string, unknown>;
				const own = typeof o.$type === 'string' ? o.$type : type;
				if ('$value' in o) {
					raws.set(path.join('.'), { path, type: own, value: o.$value, file, line: lineOf(path) });
					return;
				}
				for (const [key, child] of Object.entries(o)) if (!key.startsWith('$')) walk(child, [...path, key], own);
			};
			walk(json, [], undefined);
		}
		/** A value that names another token (`{color.red.500}`), followed to what it names. */
		const resolve = (value: unknown, depth = 0): unknown => {
			const m = typeof value === 'string' ? POINTER.exec(value) : null;
			const next = m ? raws.get(m[1] as string) : undefined;
			return next && depth <= 5 ? resolve(next.value, depth + 1) : value;
		};

		const tokens: DesignToken[] = [];
		for (const [path, raw] of raws) {
			const value = resolve(raw.value);
			// Typography (R3): a family, a weight, a size named as one, or a typography token as each of its parts.
			const typeToken = (at: string, group: string, set: string, name: string, written: string | null) => {
				if (written !== null) tokens.push({ path: at, kind: 'font', category: primitiveOf('font', at) as string, group, set, name, value: written, source: { file: raw.file, line: raw.line } });
			};
			const set = raw.path.slice(0, -1).join('.') || path;
			const last = raw.path[raw.path.length - 1] as string;
			if (raw.type === 'fontFamily') {
				typeToken(path, TYPE_PARTS.family, set, last, familyOf(value));
				continue;
			}
			if (raw.type === 'fontWeight') {
				typeToken(path, TYPE_PARTS.weight, set, last, plainOf(value));
				continue;
			}
			if (raw.type === 'dimension' && /font[._-]?size/i.test(path)) {
				typeToken(path, TYPE_PARTS.size, set, last, lengthOf(value));
				continue;
			}
			if (raw.type === 'typography' && value !== null && typeof value === 'object') {
				for (const [key, group] of Object.entries(TYPE_KEYS)) {
					const part = (value as Record<string, unknown>)[key];
					if (part !== undefined) typeToken(`${path}.${key}`, group, path, key, (READ_PART[group] as (v: unknown) => string | null)(resolve(part)));
				}
				continue;
			}
			const color = raw.type === 'color' && typeof value === 'string' ? value : null;
			const length = raw.type === 'dimension' ? lengthOf(value) : null;
			const kind = color !== null ? 'color' : length !== null ? 'dimension' : null;
			const category = kind === null ? null : primitiveOf(kind, path);
			if (kind === null || category === null) continue;
			tokens.push({
				path,
				kind,
				category,
				group: capitalized(raw.path[0] as string),
				set,
				name: last,
				value: (color ?? length) as string,
				source: { file: raw.file, line: raw.line },
			});
		}
		// A pointer is kept only to a token the list has.
		const paths = new Set(tokens.map((t) => t.path));
		for (const t of tokens) {
			const written = raws.get(t.path)?.value;
			const named = typeof written === 'string' ? POINTER.exec(written)?.[1] : undefined;
			if (named !== undefined && paths.has(named)) t.ref = { path: named };
		}
		// A token that names another is the semantic one; the ones with a value of their own are the primitives.
		const named = (t: DesignToken) => POINTER.test(String(raws.get(t.path)?.value));
		return tokens.length === 0 && problems.length === 0 ? null : { source: tokenFiles.name, tokens: semanticFirst(tokens, (t) => !named(t)), problems };
	},

	edit: (text, token, to) => {
		const at = entriesOf(text);
		const own = at.get(`${token.path}.$value`);
		if (!own || at.get(token.path)?.line !== token.source.line) throw notWhereRead(token);
		if ('ref' in to) return replaced(text, own.span, JSON.stringify(`{${to.ref}}`));
		// A length written as `{ "value": 4, "unit": "px" }` keeps that shape; anything else is written as a string.
		const length = own.value.kind === 'object' ? lengthParts(to.value) : null;
		return replaced(text, own.span, length ? `{ "value": ${length.number}, "unit": "${length.unit}" }` : JSON.stringify(to.value));
	},
};
