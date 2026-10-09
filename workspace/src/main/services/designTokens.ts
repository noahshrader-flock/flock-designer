/**
 * The design library's tokens, as one list (T1 of the design system plan): what the Design System tab shows and, later,
 * lets a person adjust. **Found, not listed:** read from the library's own files, so a colour added to the library is
 * here with nothing written in this app. Read as text, never run, as the catalog reads stories (`componentCatalog.ts`).
 *
 * **In layers, behind one reader** (decision 18): each way a library can keep its tokens is a source, tried in order, and
 * the first that finds its files gives the list. Every source returns the same shape, so nothing that shows or changes a
 * token learns where it came from. Only the first is built, the theme files FUI keeps: the others (CSS variables, a
 * token JSON file, an agent reading what is there) come with a second design system.
 *
 * A value that is not plain is named, with its file and line, and the rest are still read: this never guesses.
 */
import { dirname, join } from 'node:path';
import type { DesignToken, DesignTokens, TokenProblem } from '../../shared/contract';
import type { CatalogReads } from './componentCatalog';

/** A way a library can keep its tokens: where it looks, and the list when it finds its files there (`null` when not). */
interface TokenSource {
	name: string;
	looksAt: string[];
	read(reads: CatalogReads): Promise<DesignTokens | null>;
}

// An object literal's entries, each with the line it starts on, as written. Strings, templates and comments are stepped
// over whole, so a brace or a comma inside them counts for nothing.

type Node = { kind: 'object'; entries: Entry[] } | { kind: 'value'; text: string };
interface Entry {
	key: string | null;
	/** `...name`: the entries of another object, spread in. */
	spread?: string;
	value: Node;
	line: number;
}

const lineAt = (text: string, i: number): number => text.slice(0, i).split('\n').length;

/** Just past a string, template or comment starting at `i`, or `i` when none does. */
const skipNonCode = (text: string, i: number): number => {
	const c = text[i];
	if (c === '/' && text[i + 1] === '/') {
		const end = text.indexOf('\n', i);
		return end < 0 ? text.length : end;
	}
	if (c === '/' && text[i + 1] === '*') {
		const end = text.indexOf('*/', i + 2);
		return end < 0 ? text.length : end + 2;
	}
	if (c === "'" || c === '"') {
		let j = i + 1;
		while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
		return j + 1;
	}
	if (c === '`') {
		let j = i + 1;
		let inner = 0;
		while (j < text.length) {
			if (text[j] === '\\') j += 2;
			else if (inner === 0 && text[j] === '`') return j + 1;
			else if (text[j] === '$' && text[j + 1] === '{') {
				inner++;
				j += 2;
			} else if (inner > 0 && text[j] === '}') {
				inner--;
				j++;
			} else j++;
		}
		return text.length;
	}
	return i;
};

/** Where the code of a stretch of text starts, past white space and comments. */
const codeStart = (text: string, from: number, to: number): number => {
	let i = from;
	while (i < to) {
		if (/\s/.test(text[i] as string)) i++;
		else {
			const j = text[i] === '/' ? skipNonCode(text, i) : i;
			if (j === i) return i;
			i = j;
		}
	}
	return to;
};

/** The object literal whose `{` is at `open`, and where it ends. */
const parseObject = (text: string, open: number): { node: Node; end: number } => {
	const entries: Entry[] = [];
	let start = open + 1;
	let depth = 0;
	const entry = (from: number, to: number) => {
		const at = codeStart(text, from, to);
		if (at >= to) return;
		const line = lineAt(text, at);
		if (text.startsWith('...', at)) {
			entries.push({ key: null, spread: text.slice(at + 3, to).trim(), value: { kind: 'value', text: '' }, line });
			return;
		}
		// The key ends at the first colon of the entry's own code.
		let i = at;
		while (i < to && text[i] !== ':') i = Math.max(skipNonCode(text, i), i + 1);
		const key = text.slice(at, i).trim().replace(/^['"]|['"]$/g, '');
		const valueAt = codeStart(text, i + 1, to);
		const value: Node =
			text[valueAt] === '{' ? parseObject(text, valueAt).node : { kind: 'value', text: text.slice(valueAt, to).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').trim() };
		entries.push({ key, value, line });
	};
	let i = open + 1;
	while (i < text.length) {
		const j = skipNonCode(text, i);
		if (j > i) {
			i = j;
			continue;
		}
		const c = text[i];
		if (c === '{' || c === '[' || c === '(') depth++;
		else if (c === '}' || c === ']' || c === ')') {
			if (depth === 0) {
				entry(start, i);
				return { node: { kind: 'object', entries }, end: i + 1 };
			}
			depth--;
		} else if (c === ',' && depth === 0) {
			entry(start, i);
			start = i + 1;
		}
		i++;
	}
	return { node: { kind: 'object', entries }, end: text.length };
};

/** Every `export const name = { … }` in a file, by name. */
const exportedObjects = (text: string): Map<string, Entry[]> => {
	const found = new Map<string, Entry[]>();
	for (const m of text.matchAll(/export\s+const\s+(\w+)\s*(?::[^=]+)?=\s*\{/g)) {
		const { node } = parseObject(text, (m.index ?? 0) + m[0].length - 1);
		if (node.kind === 'object') found.set(m[1] as string, node.entries);
	}
	return found;
};

// FUI's theme files: ten tone families, the palette of each mode pointing at them, and the theme's spacing and radius.

const TONES_INDEX = 'src/colors/tones/index.ts';
const PALETTE_DIR = 'src/colors/theme';
const THEME_FILE = 'src/utils/theme.ts';

const HEX = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;
const literal = (text: string): string | null => /^(['"])(.*)\1$/.exec(text)?.[2] ?? null;

/** A colour as a palette writes it: a tone step (`pineGreen[50]`), the same with an opacity after it, or a hex. */
const colourOf = (text: string, tones: Map<string, Map<string, string>>): { value: string; ref?: DesignToken['ref'] } | string => {
	const hex = literal(text);
	if (hex !== null && HEX.test(hex)) return { value: hex.toUpperCase() };
	const m = /^(?:(\w+)\[(\d+)\]|`\$\{(\w+)\[(\d+)\]\}([0-9a-fA-F]{2})`)$/.exec(text);
	if (!m) return `${text} is not a tone step, a tone step with an opacity, or a hex, so it is not read`;
	const [tone, step, alpha] = m[1] ? [m[1], m[2] as string, undefined] : [m[3] as string, m[4] as string, m[5]];
	const value = tones.get(tone)?.get(step);
	if (value === undefined) return `${text} points at a tone step the library does not have`;
	return { value: alpha ? `${value}${alpha.toUpperCase()}` : value, ref: alpha ? { tone, step, alpha } : { tone, step } };
};

const themeFiles: TokenSource = {
	name: 'theme files',
	looksAt: [TONES_INDEX],
	read: async (reads) => {
		const index = await reads.readFile(TONES_INDEX).catch(() => null);
		if (index === null) return null;
		const tokens: DesignToken[] = [];
		const problems: TokenProblem[] = [];
		const readOrSay = async (file: string): Promise<string | null> => {
			const text = await reads.readFile(file).catch(() => null);
			if (text === null) problems.push({ file, reason: `${file} could not be read` });
			return text;
		};

		// The tone families the index exports, each step with its colour, in the file's order.
		const tones = new Map<string, Map<string, string>>();
		for (const m of index.matchAll(/export\s*\{\s*(\w+)\s*\}\s*from\s*['"](\.\/[\w-]+)['"]/g)) {
			const [name, from] = [m[1] as string, m[2] as string];
			const file = join(dirname(TONES_INDEX), `${from}.ts`);
			const text = await readOrSay(file);
			if (text === null) continue;
			const entries = exportedObjects(text).get(name);
			if (!entries) {
				problems.push({ file, reason: `${file} does not export ${name} as an object of steps` });
				continue;
			}
			const steps = new Map<string, string>();
			for (const e of entries) {
				const hex = e.value.kind === 'value' ? literal(e.value.text) : null;
				if (e.key === null || !/^\d+$/.test(e.key) || hex === null || !HEX.test(hex)) {
					const written = e.value.kind === 'value' ? e.value.text : 'an object';
					problems.push({ file, line: e.line, reason: `${name} ${e.key ?? `...${e.spread}`} is ${written}, not a hex colour, so this step is not read` });
					continue;
				}
				steps.set(e.key, hex.toUpperCase());
				tokens.push({ path: `tone.${name}.${e.key}`, kind: 'colour', group: 'Tones', set: name, name: e.key, value: hex.toUpperCase(), source: { file, line: e.line } });
			}
			tones.set(name, steps);
		}

		// Each palette file's roles, resolved once: a file both modes spread in is read, and its problems said, once.
		type Role = Omit<DesignToken, 'path' | 'group'>;
		const files = (await reads.listFiles(PALETTE_DIR)).filter((f) => /\.ts$/.test(f) && !f.endsWith('/index.ts')).sort();
		const objects = new Map<string, { file: string; entries: Entry[] }>();
		for (const file of files) {
			const text = await readOrSay(file);
			if (text !== null) for (const [name, entries] of exportedObjects(text)) objects.set(name, { file, entries });
		}
		const resolved = new Map<string, Role[]>();
		const rolesOf = (name: string, seen: Set<string> = new Set()): Role[] => {
			const done = resolved.get(name);
			if (done) return done;
			const object = objects.get(name);
			if (!object || seen.has(name)) return [];
			seen.add(name);
			const roles: Role[] = [];
			for (const e of object.entries) {
				if (e.spread !== undefined) {
					if (objects.has(e.spread)) roles.push(...rolesOf(e.spread, seen));
					else problems.push({ file: object.file, line: e.line, reason: `...${e.spread} is not a palette in ${PALETTE_DIR}` });
					continue;
				}
				if (e.key === 'mode') continue;
				if (e.value.kind !== 'object') {
					problems.push({ file: object.file, line: e.line, reason: `${e.key}: a role is an object of colours, so it is not read` });
					continue;
				}
				for (const v of e.value.entries) {
					const colour = v.value.kind === 'value' ? colourOf(v.value.text, tones) : `${v.key}: an object where a colour belongs`;
					if (typeof colour === 'string') {
						problems.push({ file: object.file, line: v.line, reason: colour });
						continue;
					}
					roles.push({ kind: 'colour', set: e.key as string, name: v.key as string, ...colour, source: { file: object.file, line: v.line } });
				}
			}
			resolved.set(name, roles);
			return roles;
		};
		// A palette is an object with a mode (`mode: 'light' as PaletteMode`); light first, as a person reads them.
		const modeOf = (entries: Entry[]): string | null => {
			const mode = entries.find((e) => e.key === 'mode')?.value;
			return mode?.kind === 'value' ? (/^(['"])(\w+)\1/.exec(mode.text)?.[2] ?? null) : null;
		};
		const palettes = [...objects]
			.map(([name, { entries }]) => ({ name, mode: modeOf(entries) }))
			.filter((p): p is { name: string; mode: string } => p.mode !== null)
			.sort((a, b) => (a.mode === 'light' ? -1 : b.mode === 'light' ? 1 : a.mode.localeCompare(b.mode)));
		for (const { name, mode } of palettes) {
			const group = mode.charAt(0).toUpperCase() + mode.slice(1);
			for (const r of rolesOf(name)) tokens.push({ path: `palette.${mode}.${r.set}.${r.name}`, group, ...r });
		}

		// The theme's base spacing and radius, in pixels.
		const theme = await readOrSay(THEME_FILE);
		if (theme !== null) {
			const shape = /\bconst\s+shape\b[^=]*=\s*\{/.exec(theme);
			const radius = shape ? /\bborderRadius\s*:\s*(\d+)\s*[,}\n]/.exec(theme.slice(shape.index)) : null;
			const found: [string, RegExpExecArray | null, number][] = [
				['spacing', /\bconst\s+spacing\s*=\s*(\d+)\s*;/.exec(theme), 0],
				['radius', radius, shape?.index ?? 0],
			];
			for (const [name, m, offset] of found) {
				if (!m) {
					problems.push({ file: THEME_FILE, reason: `the theme's ${name} was not found as a number` });
					continue;
				}
				const group = name.charAt(0).toUpperCase() + name.slice(1);
				tokens.push({ path: name, kind: 'dimension', group, set: name, name: 'base', value: `${m[1]}px`, source: { file: THEME_FILE, line: lineAt(theme, offset + m.index) } });
			}
		}
		return { source: themeFiles.name, tokens, problems, looked: themeFiles.looksAt };
	},
};

/** The ways tokens are found, in the order they are tried (decision 18). */
const SOURCES: TokenSource[] = [themeFiles];

/** The library's tokens, from the first source that finds its files; none, and where it looked, when no source does. */
export const readTokens = async (reads: CatalogReads): Promise<DesignTokens> => {
	for (const source of SOURCES) {
		const found = await source.read(reads);
		if (found) return found;
	}
	return { source: null, tokens: [], problems: [], looked: SOURCES.flatMap((s) => s.looksAt) };
};
