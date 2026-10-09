/**
 * Tokens kept in design token files, the standard JSON format (the Design Tokens Community Group's, which Style
 * Dictionary and Tokens Studio write): a token is an object with a `$value`, its kind the `$type` it has or its group
 * has. Colors, and lengths whose name says spacing or radius, are read; other kinds (typography, shadows, durations) are
 * left out until the panel shows them. A value that names another token (`{color.red.500}`) is that token's value, and
 * points at it. Each token's line is exact: the file is read a second time for where things are, by the same reader the
 * theme files use (JSON is an object literal too). A change is written in the token's `$value`, in the shape it had.
 */
import type { DesignToken, TokenProblem } from '../../../shared/contract';
import { DIMENSION } from '../../../shared/tokens';
import { type Entry, parseObject, replaced } from './objectLiteral';
import { type TokenSource, capitalized, categoryOf, notWhereRead, semanticFirst } from './source';

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
			const color = raw.type === 'color' && typeof value === 'string' ? value : null;
			const length = raw.type === 'dimension' ? lengthOf(value) : null;
			const kind = color !== null ? 'color' : length !== null ? 'dimension' : null;
			const category = kind === null ? null : categoryOf(kind, path);
			if (kind === null || category === null) continue;
			tokens.push({
				path,
				kind,
				category,
				group: capitalized(raw.path[0] as string),
				set: raw.path.slice(0, -1).join('.') || path,
				name: raw.path[raw.path.length - 1] as string,
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
		if ('ref' in to) return replaced(text, own.span, JSON.stringify(`{${to.ref.path}}`));
		// A length written as `{ "value": 4, "unit": "px" }` keeps that shape; anything else is written as a string.
		const length = own.value.kind === 'object' ? /^(-?\d*\.?\d+)(px|rem|em)$/.exec(to.value) : null;
		return replaced(text, own.span, length ? `{ "value": ${Number(length[1])}, "unit": "${length[2]}" }` : JSON.stringify(to.value));
	},
};
