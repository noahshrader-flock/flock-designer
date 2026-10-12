/**
 * Tokens kept as CSS variables, as shadcn and Tailwind design systems keep them: `--primary: oklch(…)` in `:root`, the
 * dark values in `.dark`, a Tailwind scale in `@theme` (`--color-red-500`). A variable is a token when its value is a
 * color, or a length whose name says spacing or radius (`primitiveOf`), or typography or a shadow by its name (a family, a
 * weight, a size, a line height; `--shadow-sm`), or a duration or an easing; every other variable (a z-index) is left out,
 * not guessed. A value that names another variable (`var(--ring)`) is the color it points at,
 * and points at that variable's token. A change is written in the variable's own declaration: `--primary: #108062;`, or
 * `--primary: var(--ring);` to point it elsewhere.
 */
import type { DesignToken } from '../../../shared/contract';
import { DIMENSION, DURATION } from '../../../shared/tokens';
import { lineAt, replaced } from './objectLiteral';
import { MOTION_PARTS, SHADOWS, TYPE_PARTS, primitiveOf } from '../../../shared/primitives';
import { type TokenSource, capitalized, notWhereRead, semanticFirst } from './source';

const STYLESHEET = /\.(css|scss|less|pcss)$/;
/** An easing (`cubic-bezier(…)`, `ease-out`, `linear`): motion, by its value, as a duration is (`DURATION`). */
const EASING = /^(cubic-bezier\(.*\)|steps\(.*\)|linear(\(.*\))?|ease(-in|-out|-in-out)?)$/;

/**
 * Which part of typography a variable is, by its name as Tailwind's theme names it (and the plain names others use): its
 * group, the style it belongs to, and its own name; null for one that is not typography. A color is never typography,
 * however it is named (`--text-muted: #666`), so this is asked only of a value that is not one.
 */
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

interface Variable {
	value: string;
	file: string;
	line: number;
}

/** Comments as spaces, so what is left keeps every offset, and so every line number. */
const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));

/** A value that is only a pointer to another variable: `var(--ring)`, with or without a fallback. */
const POINTER = /^var\(\s*--([\w-]+)\s*(?:,[^)]*)?\)$/;

/** A token's variable name: `css.dark.primary` is `--primary`. */
const variableOf = (path: string): string => path.split('.').slice(2).join('.');

export const cssVariables: TokenSource = {
	name: 'CSS variables',
	read: async (reads, files) => {
		// Each mode's variables, the last one written winning, as in the browser.
		const modes = new Map<string, Map<string, Variable>>([['light', new Map()]]);
		for (const file of files.filter((f) => STYLESHEET.test(f)).sort()) {
			const css = await reads.readFile(file).catch(() => null);
			if (css === null) continue;
			const text = withoutComments(css);
			for (const block of text.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
				const mode = /dark/i.test(block[1] as string) ? 'dark' : 'light';
				const vars = modes.get(mode) ?? modes.set(mode, new Map()).get(mode)!;
				const bodyAt = (block.index ?? 0) + (block[1] as string).length + 1;
				for (const v of (block[2] as string).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
					vars.set(v[1] as string, { value: (v[2] as string).trim(), file, line: lineAt(text, bodyAt + (v.index ?? 0)) });
				}
			}
		}
		/** The mode a variable a pointer names is found in: its own mode first, then the light one. */
		const modeOf = (name: string, mode: string): string | null => (modes.get(mode)?.has(name) ? mode : modes.get('light')?.has(name) ? 'light' : null);
		/** A value with any `var(--name)` followed. */
		const resolve = (value: string, mode: string, depth = 0): string => {
			const m = POINTER.exec(value);
			const at = m ? modeOf(m[1] as string, mode) : null;
			if (!m || at === null || depth > 5) return value;
			return resolve((modes.get(at)?.get(m[1] as string) as Variable).value, mode, depth + 1);
		};

		const tokens: DesignToken[] = [];
		for (const [mode, vars] of modes) {
			for (const [name, v] of vars) {
				const value = resolve(v.value, mode);
				const pointer = POINTER.exec(v.value)?.[1];
				const pointerMode = pointer === undefined ? null : modeOf(pointer, mode);
				// Typography and shadows are known by their names; a color is a color, however it is named (`--shadow-color`).
				const type = COLOR.test(value) ? null : typography(name, value);
				const shadow = COLOR.test(value) ? null : /^(.*shadow)(?:-(.+))?$/.exec(name);
				const named = type !== null ? { kind: 'font' as const, ...type } : shadow ? { kind: 'shadow' as const, group: SHADOWS, set: shadow[1] as string, name: shadow[2] ?? 'base' } : null;
				if (named !== null) {
					tokens.push({ path: `css.${mode}.${name}`, category: primitiveOf(named.kind, name) as string, ...named, value, source: { file: v.file, line: v.line } });
					continue;
				}
				const kind = COLOR.test(value) ? 'color' : DIMENSION.test(value) ? 'dimension' : DURATION.test(value) ? 'duration' : EASING.test(value) ? 'easing' : null;
				const category = kind === null ? null : primitiveOf(kind, name);
				if (kind === null || category === null) continue;
				// A scale's steps are one set: `--color-red-500` is step 500 of `color-red`.
				const step = /^(.*)-(\d+)$/.exec(name);
				tokens.push({
					path: `css.${mode}.${name}`,
					kind,
					category,
					group: kind === 'color' ? capitalized(mode) : kind === 'duration' || kind === 'easing' ? MOTION_PARTS[kind] : category,
					set: step ? (step[1] as string) : name,
					name: step ? (step[2] as string) : name,
					value,
					...(pointerMode === null ? {} : { ref: { path: `css.${pointerMode}.${pointer}` } }),
					source: { file: v.file, line: v.line },
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
		// Found in the text with its comments blanked, so a commented-out declaration on the same line is not the one changed.
		const lines = withoutComments(text).split('\n');
		const start = lines.slice(0, token.source.line - 1).reduce((n, l) => n + l.length + 1, 0);
		const m = new RegExp(`(?<![\\w-])(--${variableOf(token.path)}\\s*:\\s*)([^;]*?)\\s*;`).exec(lines[token.source.line - 1] ?? '');
		if (!m) throw notWhereRead(token);
		const from = start + m.index + (m[1] as string).length;
		return replaced(text, [from, from + (m[2] as string).length], 'value' in to ? to.value : `var(--${variableOf(to.ref)})`);
	},
};
