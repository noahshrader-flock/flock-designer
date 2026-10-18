import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * What a person reads never says "iteration", nor names work as an iteration once was (`I3`): a prototype has versions
 * (VERSIONS_PLAN Phase 4). Read from the text in the code that draws the screens and writes their messages, its comments
 * aside; what is inside `${…}` is code, not words, so it is left out too.
 */
const root = join(__dirname, '..');
const DIRS = ['src/renderer', 'src/viewer', 'src/site', 'src/cli', 'src/main', 'extension/src', 'extension/webview'];
/** Where the word means something else: a design token's saves, and the product's own command, which it names so. */
const ELSEWHERE = [/the history is the iterations/, /check-iteration/];

const files = (dir: string): string[] =>
	readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
	);

/** A line with what is inside each `${…}` taken out, nested ones and their own quotes with them: that is code, not words. */
const withoutCode = (line: string): string => {
	let out = '';
	for (let i = 0, depth = 0; i < line.length; i++) {
		if (line.startsWith('${', i)) {
			depth++;
			i++;
		} else if (depth > 0 && line[i] === '{') depth++;
		else if (depth > 0 && line[i] === '}') depth--;
		else if (depth === 0) out += line[i];
	}
	return out;
};

/** Each quoted text in a line of code. */
const words = (line: string): string[] =>
	[...withoutCode(line).matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');

describe('the words a person reads', () => {
	it('say version, never iteration, nor an iteration’s label', () => {
		const said = DIRS.flatMap(files).flatMap((file) =>
			readFileSync(join(root, file), 'utf8')
				.split('\n')
				.map((line, i) => ({ line, at: `${file}:${i + 1}` }))
				.filter(({ line }) => !/^\s*(\*|\/\/|\/\*\*)/.test(line) && !/^\s*import /.test(line))
				.flatMap(({ line, at }) =>
					words(line)
						.filter((w) => /\biterations?\b/i.test(w) || /\bI\d+\b/.test(w))
						.filter((w) => !ELSEWHERE.some((e) => e.test(w)))
						.map((w) => `${at}: ${w}`),
				),
		);
		expect(said).toEqual([]);
	});
});
