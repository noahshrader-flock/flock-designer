import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCRIPT_EXTENSIONS } from './componentCatalog';

/**
 * What a library's own Storybook set-up gives the stories it draws, found as Storybook finds it: in the design system's own
 * package (`folder`, in a monorepo), else the repository's. **Read, never run:** the app builds and draws the library's
 * code in the sandboxed preview frame only, so its Storybook configuration is read as text.
 */

/** The `.storybook/<name>` file a library's stories are drawn with, its package's before the repository's; null for none. */
const setupFile = (library: string, folder: string, name: 'preview' | 'main'): string | null => {
	for (const at of folder === '' ? [''] : [folder, '']) {
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
		const body = objectAt(text, (opener.index ?? 0) + opener[0].length - 1);
		if (body === null) continue;
		for (const entry of topLevel(body)) {
			const m = /^\s*(?:(['"])([\w$.]+)\1|([\w$.]+))\s*:\s*([\s\S]+?)\s*$/.exec(entry);
			const value = m ? valueOf(m[4] as string) : null;
			if (m && value !== null) found[(m[2] ?? m[3]) as string] = value;
		}
	}
	return found;
};

/** The text inside the braces that open at `start`, strings and nested braces skipped; null when they do not close. */
const objectAt = (text: string, start: number): string | null => {
	let depth = 0;
	for (let i = start; i < text.length; i++) {
		const c = text[i];
		if (c === '"' || c === "'" || c === '`') {
			i = stringEnd(text, i);
			continue;
		}
		if (c === '{' || c === '(' || c === '[') depth++;
		else if (c === '}' || c === ')' || c === ']') {
			depth--;
			if (depth === 0) return text.slice(start + 1, i);
		}
	}
	return null;
};

/** Where the string that opens at `start` ends. */
const stringEnd = (text: string, start: number): number => {
	for (let i = start + 1; i < text.length; i++) {
		if (text[i] === '\\') i++;
		else if (text[i] === text[start]) return i;
	}
	return text.length;
};

/** An object's entries at its own level, split at its commas, not at those of what is inside them. */
const topLevel = (body: string): string[] => {
	const entries: string[] = [];
	let depth = 0;
	let from = 0;
	for (let i = 0; i < body.length; i++) {
		const c = body[i];
		if (c === '"' || c === "'" || c === '`') i = stringEnd(body, i);
		else if (c === '{' || c === '(' || c === '[') depth++;
		else if (c === '}' || c === ')' || c === ']') depth--;
		else if (c === ',' && depth === 0) {
			entries.push(body.slice(from, i));
			from = i + 1;
		}
	}
	entries.push(body.slice(from));
	return entries.filter((e) => e.trim() !== '');
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
