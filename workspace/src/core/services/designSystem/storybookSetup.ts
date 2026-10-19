import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCRIPT_EXTENSIONS } from './componentCatalog';
import { parseObject } from './tokens/objectLiteral';

/**
 * **Read, never run:** the library's code runs only in the sandboxed preview frame, so its Storybook configuration is read
 * as text.
 */

/** Its package (`folder`, in a monorepo) first, then the repository's root (`''`), as Storybook and Node look. */
export const packageFirst = (folder: string): string[] => (folder === '' ? [''] : [folder, '']);

export const packagesOf = (root: string, folder: string): string[] => packageFirst(folder).map((at) => join(root, at, 'node_modules'));

const setupFile = (library: string, folder: string, name: 'preview' | 'main'): string | null => {
	for (const at of packageFirst(folder)) {
		const found = SCRIPT_EXTENSIONS.map((e) => join(library, at, '.storybook', `${name}.${e}`)).find((f) => existsSync(f));
		if (found) return found;
	}
	return null;
};

/** An absolute path. */
export const previewSetup = (library: string, folder: string): string | null => setupFile(library, folder, 'preview');

/**
 * Without these (Primer's `__DEV__`), code that reads one throws. Only a value written out (a literal, or `JSON.stringify`
 * of one) is taken, since the configuration is not run.
 */
export const storybookDefines = (library: string, folder: string): Record<string, string> => {
	const main = setupFile(library, folder, 'main');
	return main === null ? {} : definesIn(readFileSync(main, 'utf8'));
};

export const definesIn = (text: string): Record<string, string> => {
	const found: Record<string, string> = {};
	for (const opener of text.matchAll(/(?:\bdefine\s*[:=]|\bDefinePlugin\s*\()\s*\{/g)) {
		const { node } = parseObject(text, (opener.index ?? 0) + opener[0].length - 1);
		if (node.kind !== 'object') continue;
		for (const { key, value } of node.entries) {
			const written = key !== null && /^[\w$.]+$/.test(key) && value.kind === 'value' ? valueOf(value.text) : null;
			if (written !== null) found[key as string] = written;
		}
	}
	return found;
};

const LITERAL = /^(?:true|false|null|-?\d+(?:\.\d+)?|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")$/;
const asJson = (literal: string): string => (literal.startsWith("'") ? JSON.stringify(literal.slice(1, -1).replace(/\\(.)/g, '$1')) : literal);

/**
 * As esbuild takes it: `JSON.stringify(<literal>)`, a number or a boolean is that literal; a string is the code it holds,
 * taken only when that is itself a literal (`'"ui"'`).
 */
const valueOf = (code: string): string | null => {
	const stringified = /^JSON\.stringify\(\s*([\s\S]*?)\s*\)$/.exec(code);
	if (stringified) return LITERAL.test(stringified[1] as string) ? asJson(stringified[1] as string) : null;
	if (!LITERAL.test(code)) return null;
	if (!code.startsWith("'") && !code.startsWith('"')) return code;
	const held = JSON.parse(asJson(code)) as string;
	return LITERAL.test(held) ? asJson(held) : null;
};
