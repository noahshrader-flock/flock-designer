/**
 * A variable is a token only when its value or name says which primitive it is; any other (a z-index) is left out, not
 * guessed. A package's variable is changed by declaring it again in the library's stylesheet that imports it.
 */
import type { DesignToken } from '../../../../shared/contract';
import { DIMENSION, DURATION, hexOf } from '../../../../shared/tokens';
import { lineAt, replaced } from './objectLiteral';
import { MOTION_PARTS, SHADOWS, TYPE_PARTS, primitiveOf } from '../../../../shared/primitives';
import { capitalize } from '../../../../shared/titleCase';
import { type TokenSource, notWhereRead, semanticFirst } from './source';
import { type CatalogReads, SCRIPT_EXTENSIONS } from '../componentCatalog';
import { posix } from 'node:path';

const STYLESHEET = /\.(css|scss|less|pcss)$/;
const EASING = /^(cubic-bezier\(.*\)|steps\(.*\)|linear(\(.*\))?|ease(-in|-out|-in-out)?)$/;

/** By Tailwind's theme names. Ask only of a value that is not a color: `--text-muted: #666` is a color, not typography. */
const typography = (name: string, value: string): { group: string; set: string; name: string } | null => {
	const m = (re: RegExp) => re.exec(name);
	let found: RegExpExecArray | null;
	if ((found = m(/^font-weight-(.+)$/))) return { group: TYPE_PARTS.weight, set: 'font-weight', name: found[1] as string };
	if ((found = m(/^font-size-(.+)$/))) return { group: TYPE_PARTS.size, set: found[1] as string, name: 'size' };
	if ((found = m(/^text-(.+)--line-height$/))) return { group: TYPE_PARTS.lineHeight, set: found[1] as string, name: 'line height' };
	if ((found = m(/^text-(.+)$/)) && DIMENSION.test(value)) return { group: TYPE_PARTS.size, set: found[1] as string, name: 'size' };
	if ((found = m(/^(leading|line-height)-(.+)$/))) return { group: TYPE_PARTS.lineHeight, set: found[1] as string, name: found[2] as string };
	if ((found = m(/^font-(.+)$/))) return { group: TYPE_PARTS.family, set: 'font', name: found[1] as string };
	return null;
};
const COLOR = /^(#[0-9a-f]{3,8}|(rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(.*\))$/i;

/**
 * A color kept as bare HSL channels, as shadcn keeps them to use inside `hsl()`: `222.2 47.4% 11.2%`, with an opacity after a
 * slash. Read as the hex it draws, so it is shown, compared and changed as any color is, and written back as channels.
 */
const CHANNELS = /^(-?\d*\.?\d+)(?:deg)?\s+(\d*\.?\d+)%\s+(\d*\.?\d+)%(?:\s*\/\s*(\d*\.?\d+)(%?))?$/;
const hex2 = (n: number): string =>
	Math.round(n * 255)
		.toString(16)
		.padStart(2, '0')
		.toUpperCase();

export const hexOfChannels = (channels: string): string | null => {
	const m = CHANNELS.exec(channels);
	if (!m) return null;
	const [h, s, l] = [Number(m[1]) / 360, Number(m[2]) / 100, Number(m[3]) / 100];
	const f = (n: number) => {
		const k = (n + h * 12) % 12;
		return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
	};
	const alpha = m[4] === undefined ? '' : hex2(Number(m[4]) / (m[5] ? 100 : 1));
	return `#${hex2(f(0))}${hex2(f(8))}${hex2(f(4))}${alpha === 'FF' ? '' : alpha}`;
};

/** A hex as the channels that draw it, precise enough that they draw that hex again. */
export const channelsOf = (hex: string): string => {
	const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	const d = max - min;
	const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
	const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	const n = (v: number) => String(Number(v.toFixed(2)));
	const alpha = hex.length === 9 ? ` / ${Number((parseInt(hex.slice(7), 16) / 255).toFixed(3))}` : '';
	return `${n(h * 60)} ${n(s * 100)}% ${n(l * 100)}%${alpha}`;
};

interface Variable {
	value: string;
	file: string;
	line: number;
	from?: NonNullable<DesignToken['source']['from']>;
}

interface Read {
	vars: { name: string; value: string; at: number; rules: string[] }[];
	imports: { spec: string; at: number }[];
	top: { rule: string; close: number }[];
}

/** Expects comments already blanked. Quoted text is skipped, so a `;` or a brace in a font's name is not taken for one. */
const readStylesheet = (text: string): Read => {
	const read: Read = { vars: [], imports: [], top: [] };
	const rules: string[] = [];
	let start = 0;
	const statement = (end: number) => {
		const said = text.slice(start, end);
		const v = /^\s*--([\w-]+)\s*:\s*([\s\S]*?)\s*$/.exec(said);
		if (v && rules.length > 0) read.vars.push({ name: v[1] as string, value: v[2] as string, at: start + said.indexOf('--'), rules: [...rules] });
		const i = /^\s*@import\s+(?:url\(\s*)?(['"])([^'"]+)\1/.exec(said);
		if (i && rules.length === 0) read.imports.push({ spec: i[2] as string, at: start + said.indexOf('@') });
	};
	for (let at = 0; at < text.length; at++) {
		const c = text[at];
		if (c === '"' || c === "'") {
			const end = text.indexOf(c, at + 1);
			at = end === -1 ? text.length : end;
		} else if (c === ';') {
			statement(at);
			start = at + 1;
		} else if (c === '{') {
			rules.push(text.slice(start, at).trim());
			start = at + 1;
		} else if (c === '}') {
			statement(at);
			const rule = rules.pop();
			if (rules.length === 0 && rule !== undefined) read.top.push({ rule, close: at });
			start = at + 1;
		}
	}
	return read;
};

const LIGHT = /^(?::root|html|:host|body|\*)$|^(?::root|html)?(?:\.light|\[[\w-]+=(["']?)light\1\])$/i;

/**
 * The mode a variable is a token of, by the rules it is declared in: dark in a rule that names dark; light in the page's
 * own rules, at-rules alone, or a `LIGHT` rule. Null for one scoped to anything else (`.card`, a high-contrast theme),
 * which would otherwise be read over the design system's light tokens.
 */
const modeDeclaredIn = (rules: string[]): 'light' | 'dark' | null => {
	if (rules.some((r) => /\bdark\b/i.test(r))) return 'dark';
	const selectors = rules.filter((r) => !r.startsWith('@')).flatMap((r) => r.split(',').map((one) => one.trim()));
	return selectors.every((one) => LIGHT.test(one)) ? 'light' : null;
};

const ruleOf = (rules: string[]): string => [...rules].reverse().find((r) => !r.startsWith('@')) ?? ':root';

/**
 * As the library's tools find it: a path beside it (a bare `theme.css` too, when it is there), else a package as installed,
 * from the folder up to the repository's root, by its `exports`' `style`, else `style`.
 */
const importedFile = async (reads: CatalogReads, from: string, spec: string): Promise<string | null> => {
	const exists = (path: string) =>
		reads.readFile(path).then(
			() => true,
			() => false,
		);
	// An address (a web font's) is the browser's to fetch, not a file of the library's.
	if (/^[a-z][a-z\d+.-]*:/i.test(spec)) return null;
	const beside = posix.normalize(posix.join(posix.dirname(from), spec));
	if (/^\.{0,2}\//.test(spec) || (STYLESHEET.test(spec) && (await exists(beside)))) return beside.startsWith('..') ? null : beside;
	const [, name, sub] = /^((?:@[^/]+\/)?[^/]+)(?:\/(.+))?$/.exec(spec) ?? [];
	if (name === undefined) return null;
	for (let dir = posix.dirname(from); ; dir = posix.dirname(dir)) {
		const at = posix.join(dir, 'node_modules', name);
		const manifest = await reads.readFile(`${at}/package.json`).catch(() => null);
		if (manifest !== null) {
			if (sub !== undefined) return `${at}/${sub}`;
			const pkg = JSON.parse(manifest) as { style?: unknown; exports?: unknown };
			const dot = (pkg.exports as Record<string, unknown> | undefined)?.['.'];
			const style = (dot as Record<string, unknown> | undefined)?.style ?? pkg.style;
			return typeof style === 'string' ? posix.join(at, style) : null;
		}
		if (dir === '.') return null;
	}
};

const PREVIEW = new RegExp(`(^|/)\\.storybook/preview\\.(${SCRIPT_EXTENSIONS.join('|')})$`);
const STYLE_IMPORT = /^\s*import\s+(['"])([^'"]+)\1/gm;

/**
 * Found by the preview's text, not a folder's name, so a unit-test set-up stylesheet importing the same packages is not
 * taken for them.
 */
const previewStylesheets = async (reads: CatalogReads): Promise<string[]> => {
	const sheets: string[] = [];
	for (const preview of (await reads.listFiles('')).filter((f) => PREVIEW.test(f) && !/(^|\/)node_modules\//.test(f)).sort()) {
		const text = await reads.readFile(preview).catch(() => '');
		for (const [, , spec] of text.matchAll(STYLE_IMPORT)) {
			const path = STYLESHEET.test(spec as string) ? await importedFile(reads, preview, spec as string) : null;
			if (path !== null && !sheets.includes(path)) sheets.push(path);
		}
	}
	return sheets;
};

/** Declared in the last top-level `rule`, or one added at the end, so it wins over the package's declaration. */
const declaredAgain = (text: string, rule: string, name: string, value: string): string => {
	const indent = /\n([ \t]+)\S/.exec(text)?.[1] ?? '\t';
	const at = readStylesheet(withoutComments(text))
		.top.filter((t) => t.rule === rule)
		.pop();
	if (at === undefined) return `${text.replace(/\s*$/, '')}\n\n${rule} {\n${indent}--${name}: ${value};\n}\n`;
	const body = text.slice(0, at.close).replace(/\s*$/, '');
	return `${body}\n${indent}--${name}: ${value};\n${text.slice(at.close)}`;
};

const sourceOf = (v: Variable): DesignToken['source'] => ({ file: v.file, line: v.line, ...(v.from ? { from: v.from } : {}) });

/** Comments as spaces, so what is left keeps every offset, and so every line number. */
const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));

const POINTER = /^var\(\s*--([\w-]+)\s*(?:,[^)]*)?\)$/;

const variableOf = (path: string): string => path.split('.').slice(2).join('.');

export const cssVariables: TokenSource = {
	name: 'CSS variables',
	read: async (reads, files) => {
		// Each mode's variables, the last one written winning, as in the browser.
		const modes = new Map<string, Map<string, Variable>>([['light', new Map()]]);
		const followed = new Set<string>();
		const take = async (file: string, imported: { file: string; line: number } | null): Promise<void> => {
			const css = await reads.readFile(file).catch(() => null);
			if (css === null) return;
			const text = withoutComments(css);
			const { vars, imports } = readStylesheet(text);
			for (const i of imports) {
				const path = await importedFile(reads, file, i.spec);
				if (path === null || followed.has(path)) continue;
				followed.add(path);
				// A package's is said as the library's stylesheet that imports it; one of the library's own files is its own.
				const inPackage = /(^|\/)node_modules\//.test(path);
				await take(path, inPackage ? (imported ?? { file, line: lineAt(text, i.at) }) : imported);
			}
			for (const v of vars) {
				const mode = modeDeclaredIn(v.rules);
				if (mode === null) continue;
				const own = modes.get(mode) ?? modes.set(mode, new Map()).get(mode)!;
				const line = lineAt(text, v.at);
				own.set(
					v.name,
					imported === null ? { value: v.value, file, line } : { value: v.value, ...imported, from: { file, line, rule: ruleOf(v.rules) } },
				);
			}
		};
		for (const file of files.filter((f) => STYLESHEET.test(f)).sort()) {
			if (followed.has(file)) continue;
			followed.add(file);
			await take(file, null);
		}
		// Then what the stories load, read again over them: what the preview imports is the value a story sees, and the file a
		// change to it must be written in to reach one.
		followed.clear();
		for (const file of await previewStylesheets(reads)) {
			if (followed.has(file)) continue;
			followed.add(file);
			await take(file, null);
		}
		const modeOf = (name: string, mode: string): string | null =>
			modes.get(mode)?.has(name) ? mode : modes.get('light')?.has(name) ? 'light' : null;
		const resolve = (value: string, mode: string, depth = 0): string => {
			const m = POINTER.exec(value);
			const at = m ? modeOf(m[1] as string, mode) : null;
			if (!m || at === null || depth > 5) return value;
			return resolve((modes.get(at)?.get(m[1] as string) as Variable).value, mode, depth + 1);
		};

		const tokens: DesignToken[] = [];
		for (const [mode, vars] of modes) {
			for (const [name, v] of vars) {
				const resolved = resolve(v.value, mode);
				const value = hexOfChannels(resolved) ?? (/^#[0-9a-f]{3,4}$/i.test(resolved) ? (hexOf(resolved) as string) : resolved);
				const pointer = POINTER.exec(v.value)?.[1];
				const pointerMode = pointer === undefined ? null : modeOf(pointer, mode);
				// Typography and shadows are known by their names; a color is a color, however it is named (`--shadow-color`).
				const type = COLOR.test(value) ? null : typography(name, value);
				const shadow = COLOR.test(value) ? null : /^(.*shadow)(?:-(.+))?$/.exec(name);
				const named =
					type !== null
						? { kind: 'font' as const, ...type }
						: shadow
							? { kind: 'shadow' as const, group: SHADOWS, set: shadow[1] as string, name: shadow[2] ?? 'base' }
							: null;
				if (named !== null) {
					tokens.push({
						path: `css.${mode}.${name}`,
						category: primitiveOf(named.kind, name) as string,
						...named,
						value,
						source: sourceOf(v),
					});
					continue;
				}
				const kind = COLOR.test(value)
					? 'color'
					: DIMENSION.test(value)
						? 'dimension'
						: DURATION.test(value)
							? 'duration'
							: EASING.test(value)
								? 'easing'
								: null;
				const category = kind === null ? null : primitiveOf(kind, name);
				if (kind === null || category === null) continue;
				const step = /^(.*)-(\d+)$/.exec(name);
				tokens.push({
					path: `css.${mode}.${name}`,
					kind,
					category,
					group: kind === 'color' ? capitalize(mode) : kind === 'duration' || kind === 'easing' ? MOTION_PARTS[kind] : category,
					set: step ? (step[1] as string) : name,
					name: step ? (step[2] as string) : name,
					value,
					...(pointerMode === null ? {} : { ref: { path: `css.${pointerMode}.${pointer}` } }),
					source: sourceOf(v),
				});
			}
		}
		// A pointer is kept only to a variable that is a token itself.
		const paths = new Set(tokens.map((t) => t.path));
		for (const t of tokens) if (t.ref && !paths.has(t.ref.path)) delete t.ref;
		// A scale's steps (`--color-red-500`) are the primitives; the variables named for what they are for come first.
		return tokens.length === 0 ? null : { source: cssVariables.name, tokens: semanticFirst(tokens, (t) => /^\d+$/.test(t.name)), problems: [] };
	},

	edit: (text, token, to) => {
		const declared = token.source.from;
		if (declared) return declaredAgain(text, declared.rule, variableOf(token.path), 'value' in to ? to.value : `var(--${variableOf(to.ref)})`);
		// Found in the text with its comments blanked, so a commented-out declaration on the same line is not the one changed.
		const lines = withoutComments(text).split('\n');
		const start = lines.slice(0, token.source.line - 1).reduce((n, l) => n + l.length + 1, 0);
		const m = new RegExp(`(?<![\\w-])(--${variableOf(token.path)}\\s*:\\s*)([^;]*?)\\s*;`).exec(lines[token.source.line - 1] ?? '');
		if (!m) throw notWhereRead(token);
		const from = start + m.index + (m[1] as string).length;
		// A color kept as channels stays channels, so what uses it inside `hsl()` still draws it.
		const value = 'value' in to ? (CHANNELS.test(m[2] as string) ? channelsOf(to.value) : to.value) : `var(--${variableOf(to.ref)})`;
		return replaced(text, [from, from + (m[2] as string).length], value);
	},
};
