/**
 * Tokens kept in design token files, the standard JSON format (the Design Tokens Community Group's, which Style
 * Dictionary and Tokens Studio write): a token is an object with a `$value`, its kind the `$type` it has or its group
 * has. Colors, and lengths whose name says spacing or radius, are read; other kinds (typography, shadows, durations) are
 * left out until the panel shows them. A value that names another token (`{color.red.500}`) is that token's value.
 */
import type { DesignToken, TokenProblem } from '../../../shared/contract';
import { lineAt } from './objectLiteral';
import { DIMENSION, type TokenSource, capitalized, categoryOf } from './source';

const TOKEN_FILE = /(\.tokens\.json|(^|\/)(design-)?tokens?\.json|(^|\/)(design-)?tokens\/.+\.json)$/i;

interface Raw {
	path: string[];
	type: string | undefined;
	value: unknown;
	file: string;
	line: number;
}

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
			// Each token's line: found by its keys in order, from where its group's key is.
			const lineOf = (path: string[]) => {
				let at = 0;
				for (const key of path) at = Math.max(text.indexOf(`"${key}"`, at), at);
				return lineAt(text, at);
			};
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
			const m = typeof value === 'string' ? /^\{([^{}]+)\}$/.exec(value) : null;
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
		return tokens.length === 0 && problems.length === 0 ? null : { source: tokenFiles.name, tokens, problems };
	},
};
