import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, it } from 'vitest';
import { INVOKE } from '../src/shared/contract';

/**
 * Every call in the core's contract (`INVOKE`) has a caller outside the core: a page, the extension, the command line, the
 * site. A call nothing makes is code no one runs and no test can tell is wrong, so it goes.
 * Found by its name being called (`.name(`) or named (`'name'`, as a relay's list does) in code outside the core.
 */

const workspace = join(__dirname, '..');
/** The core and the contract itself: where a call is answered and declared, not made. */
const NOT_CALLERS = ['src/core', 'src/shared/contract'];

const files = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (['node_modules', 'dist', 'out'].includes(name)) return [];
		return statSync(path).isDirectory() ? files(path) : /\.(tsx?|mjs|cjs)$/.test(name) ? [path] : [];
	});

it('has a caller for every call, outside the core', () => {
	const callers = [join(workspace, 'src'), join(workspace, 'extension'), join(workspace, 'functions')]
		.flatMap(files)
		.filter((f) => !NOT_CALLERS.some((dir) => relative(workspace, f).startsWith(`${dir}/`)));
	const text = callers.map((f) => readFileSync(f, 'utf8')).join('\n');
	const uncalled = INVOKE.filter((name) => !new RegExp(`\\.${name}\\(|['"]${name}['"]`).test(text));
	expect(uncalled).toEqual([]);
});
