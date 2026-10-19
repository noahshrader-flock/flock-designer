import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const github = resolve(__dirname, '../../.github');
const yamlFiles = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? yamlFiles(join(dir, e.name)) : /\.ya?ml$/.test(e.name) ? [join(dir, e.name)] : [],
	);

// CI's setup was once saved with a colon in a command GitHub read as a key: every job failed before a test ran, and nothing here saw it.
describe('what GitHub runs', () => {
	it.each(yamlFiles(github))('%s is YAML GitHub can read, whole', (file) => {
		expect(() => parse(readFileSync(file, 'utf8'), { strict: true })).not.toThrow();
	});

	it('finds the workflows and the shared setup', () => {
		const found = yamlFiles(github).map((f) => f.slice(github.length + 1));
		expect(found).toEqual(expect.arrayContaining(['workflows/ci.yml', 'actions/setup/action.yml']));
	});
});
