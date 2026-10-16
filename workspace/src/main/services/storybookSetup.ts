import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCRIPT_EXTENSIONS } from './componentCatalog';
import { parseObject } from './tokens/objectLiteral';

/**
 * What a library's own Storybook set-up gives the stories it draws, found as Storybook finds it: in the design system's own
 * package (`folder`, in a monorepo), else the repository's. **Read, never run:** the app builds and draws the library's
 * code in the sandboxed preview frame only, so its Storybook configuration is read as text.
 */

/**
 * Where a design system's own things are looked for, as Storybook and Node look: its package (`folder`, in a monorepo)
 * first, then the repository's root (`''`); the root alone for a design system that is the whole repository.
 */
export const packageFirst = (folder: string): string[] => (folder === '' ? [''] : [folder, '']);

/** The `.storybook/<name>` file a library's stories are drawn with, its package's before the repository's; null for none. */
const setupFile = (library: string, folder: string, name: 'preview' | 'main'): string | null => {
	for (const at of packageFirst(folder)) {
		const found = SCRIPT_EXTENSIONS.map((e) => join(library, at, '.storybook', `${name}.${e}`)).find((f) => existsSync(f));
		if (found) return found;
	}
	return null;
};

/** The library's preview set-up (its decorators, its stylesheets), by absolute path; null for none. */
export const previewSetup = (library: string, folder: string): string | null => setupFile(library, folder, 'preview');

/**
 * The globals the library's Storybook build defines for its code (`define`, as Vite and webpack's `DefinePlugin` take it):
 * Primer's `__DEV__`. Without them, code that reads one throws. Only an entry whose value is written out (a literal, or
 * `JSON.stringify` of one) is taken; one worked out when the configuration runs is left, since it is not run.
 */
export const storybookDefines = (library: string, folder: string): Record<string, string> => {
	const main = setupFile(library, folder, 'main');
	return main === null ? {} : definesIn(readFileSync(main, 'utf8'));
};

/** The `define` entries written out in a Storybook main configuration's text, as esbuild takes them. */
export const definesIn = (text: string): Record<string, string> => {
	const found: Record<string, string> = {};
	for (const opener of text.matchAll(/(?:\bdefine\s*[:=]|\bDefinePlugin\s*\()\s*\{/g)) {
		// Read as the theme readers read an object (`parseObject`): its comments, strings and spreads passed over.
		const { node } = parseObject(text, (opener.index ?? 0) + opener[0].length - 1);
		if (node.kind !== 'object') continue;
		for (const { key, value } of node.entries) {
			const written = key !== null && /^[\w$.]+$/.test(key) && value.kind === 'value' ? valueOf(value.text) : null;
			if (written !== null) found[key as string] = written;
		}
	}
	return found;
};

/** A literal as JSON: `true`, `42`, `'dev'`, `"dev"`. */
const LITERAL = /^(?:true|false|null|-?\d+(?:\.\d+)?|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")$/;
const asJson = (literal: string): string => (literal.startsWith("'") ? JSON.stringify(literal.slice(1, -1).replace(/\\(.)/g, '$1')) : literal);

/**
 * What a `define` value means, as esbuild takes it: `JSON.stringify(<literal>)` and a number or a boolean are that literal;
 * a string is the code it holds, taken when that is itself a literal (`'"ui"'`). Anything else is not written out: null.
 */
const valueOf = (code: string): string | null => {
	const stringified = /^JSON\.stringify\(\s*([\s\S]*?)\s*\)$/.exec(code);
	if (stringified) return LITERAL.test(stringified[1] as string) ? asJson(stringified[1] as string) : null;
	if (!LITERAL.test(code)) return null;
	if (!code.startsWith("'") && !code.startsWith('"')) return code;
	const held = JSON.parse(asJson(code)) as string;
	return LITERAL.test(held) ? asJson(held) : null;
};
