/**
 * Tokens kept as CSS variables, as shadcn and Tailwind design systems keep them: `--primary: oklch(…)` in `:root`, the
 * dark values in `.dark`, a Tailwind scale in `@theme` (`--color-red-500`). A variable is a token when its value is a
 * color, or a length whose name says spacing or radius (`categoryOf`); every other variable (a font size, a z-index, a
 * duration) is left out, not guessed. A value that names another variable (`var(--ring)`) is the color it points at,
 * and points at that variable's token. A change is written in the variable's own declaration: `--primary: #108062;`, or
 * `--primary: var(--ring);` to point it elsewhere.
 */
import type { DesignToken } from '../../../shared/contract';
import { DIMENSION } from '../../../shared/tokens';
import { lineAt, replaced } from './objectLiteral';
import { type TokenSource, capitalized, categoryOf, notWhereRead, semanticFirst } from './source';

const STYLESHEET = /\.(css|scss|less|pcss)$/;
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
				const kind = COLOR.test(value) ? 'color' : DIMENSION.test(value) ? 'dimension' : null;
				const category = kind === null ? null : categoryOf(kind, name);
				if (kind === null || category === null) continue;
				// A scale's steps are one set: `--color-red-500` is step 500 of `color-red`.
				const step = /^(.*)-(\d+)$/.exec(name);
				tokens.push({
					path: `css.${mode}.${name}`,
					kind,
					category,
					group: kind === 'color' ? capitalized(mode) : category,
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
		return replaced(text, [from, from + (m[2] as string).length], 'value' in to ? to.value : `var(--${variableOf(to.ref.path)})`);
	},
};
