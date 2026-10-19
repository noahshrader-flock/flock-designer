import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** A prototype has versions: what a person reads never says "iteration" nor names work like one (`I3`). */
const root = join(__dirname, '..');
const DIRS = ['src/viewer', 'src/site', 'src/cli', 'src/core', 'src/shared', 'src/codeHost', 'src/page', 'extension/src', 'extension/webview'];
/** Where the word means something else: the product's own command, which it names so. */
const ELSEWHERE = [/check-iteration/];

const files = (dir: string): string[] =>
	readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
	);

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

const words = (line: string, tsx: boolean): string[] => {
	const code = withoutCode(line);
	const quoted = [...code.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
	return tsx ? [...quoted, ...[...code.matchAll(/>([^<>{}]+)</g)].map((m) => m[1] as string)] : quoted;
};

const oldWords = (text: string): boolean => /\biterations?\b/i.test(text) || /\bI\d+\b/.test(text) || /\bV\d+\b/.test(text);

describe('the words a person reads', () => {
	it("are read from quotes and from between a component's tags, and code inside `${…}` is not", () => {
		expect(words("throw new Error('This iteration is gone.')", false).filter(oldWords)).toEqual(['This iteration is gone.']);
		expect(words('<span>Iteration 3</span>', true).filter(oldWords)).toEqual(['Iteration 3']);
		expect(words('`Saved ${iteration.name} as V3`', false).filter(oldWords)).toEqual(['Saved  as V3']);
		expect(words('`Saved ${iteration.name}`', false).filter(oldWords)).toEqual([]);
	});

	it('say version, never iteration, nor an iteration’s label', () => {
		const said = DIRS.flatMap(files).flatMap((file) =>
			readFileSync(join(root, file), 'utf8')
				.split('\n')
				.map((line, i) => ({ line, at: `${file}:${i + 1}` }))
				.filter(({ line }) => !/^\s*(\*|\/\/|\/\*\*)/.test(line) && !/^\s*import /.test(line))
				.flatMap(({ line, at }) =>
					words(line, file.endsWith('.tsx'))
						.filter(oldWords)
						.filter((w) => !ELSEWHERE.some((e) => e.test(w)))
						.map((w) => `${at}: ${w}`),
				),
		);
		expect(said).toEqual([]);
	});
});
