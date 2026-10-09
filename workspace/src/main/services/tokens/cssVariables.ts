/**
 * Tokens kept as CSS variables, as shadcn and Tailwind design systems keep them: `--primary: oklch(…)` in `:root`, the
 * dark values in `.dark`, a Tailwind scale in `@theme` (`--color-red-500`). A variable is a token when its value is a
 * colour, or a length whose name says spacing or radius (`categoryOf`); every other variable (a font size, a z-index, a
 * duration) is left out, not guessed. A value that names another variable (`var(--ring)`) is the colour it points at.
 */
import type { DesignToken } from '../../../shared/contract';
import { lineAt } from './objectLiteral';
import { DIMENSION, type TokenSource, capitalised, categoryOf } from './source';

const STYLESHEET = /\.(css|scss|less|pcss)$/;
const COLOUR = /^(#[0-9a-f]{3,8}|(rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(.*\))$/i;

interface Variable {
	value: string;
	file: string;
	line: number;
}

/** Comments as spaces, so what is left keeps every offset, and so every line number. */
const withoutComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));

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
		/** A value with any `var(--name)` followed, in its own mode first, then the light one. */
		const resolve = (value: string, mode: string, depth = 0): string => {
			const m = /^var\(\s*--([\w-]+)\s*(?:,[^)]*)?\)$/.exec(value);
			if (!m || depth > 5) return value;
			const next = modes.get(mode)?.get(m[1] as string) ?? modes.get('light')?.get(m[1] as string);
			return next ? resolve(next.value, mode, depth + 1) : value;
		};

		const tokens: DesignToken[] = [];
		for (const [mode, vars] of modes) {
			for (const [name, v] of vars) {
				const value = resolve(v.value, mode);
				const kind = COLOUR.test(value) ? 'colour' : DIMENSION.test(value) ? 'dimension' : null;
				const category = kind === null ? null : categoryOf(kind, name);
				if (kind === null || category === null) continue;
				// A scale's steps are one set: `--color-red-500` is step 500 of `color-red`.
				const step = /^(.*)-(\d+)$/.exec(name);
				tokens.push({
					path: `css.${mode}.${name}`,
					kind,
					category,
					group: kind === 'colour' ? capitalised(mode) : category,
					set: step ? (step[1] as string) : name,
					name: step ? (step[2] as string) : name,
					value,
					source: { file: v.file, line: v.line },
				});
			}
		}
		return tokens.length === 0 ? null : { source: cssVariables.name, tokens, problems: [] };
	},
};
