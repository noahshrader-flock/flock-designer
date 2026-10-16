import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'vitest';

/**
 * The real repositories some integration tests read: never written to, and never assumed to be here. Each is found
 * where its variable says, or beside this repository, which is where the app looks for them too.
 */
const beside = (name: string) => resolve(__dirname, '..', '..', '..', name);

/** The design system's clone: `FUI_ROOT`, or `flock-react-component-lib` beside this repository. */
export const REAL_LIBRARY = process.env.FUI_ROOT ?? beside('flock-react-component-lib');
/** The second design system (Phase 4), Primer React, a monorepo: `PRIMER_ROOT`, or `primer-react` beside this repository. */
export const REAL_PRIMER = process.env.PRIMER_ROOT ?? beside('primer-react');
/** A product's checkout: `COKE_ROOT`, or `flock-coke` beside this repository. */
export const REAL_COKE = process.env.COKE_ROOT ?? beside('flock-coke');

/** The library's `develop` as fetched from GitHub, or null when that clone, or its copy of `develop`, is not here. */
export const realDevelop = ((): string | null => {
	if (!existsSync(join(REAL_LIBRARY, '.git'))) return null;
	try {
		return execFileSync('git', ['-C', REAL_LIBRARY, 'rev-parse', '--verify', '--quiet', 'refs/remotes/origin/develop'], { encoding: 'utf8' }).trim();
	} catch {
		return null;
	}
})();

/** Why the library's tests cannot run here, or null when they can. */
export const libraryMissing = realDevelop === null ? `no clone of the design system with develop at ${REAL_LIBRARY} (set FUI_ROOT)` : null;
/** Why Primer's cannot, or null: its clone, with its packages installed. */
export const primerMissing = existsSync(join(REAL_PRIMER, 'node_modules', '@storybook', 'react', 'package.json'))
	? null
	: `no clone of primer/react with its packages installed at ${REAL_PRIMER} (set PRIMER_ROOT)`;
/** Why Coke's cannot, or null. */
export const cokeMissing = existsSync(join(REAL_COKE, '.dsnr', 'workspace.json'))
	? null
	: `no Coke checkout with a descriptor at ${REAL_COKE} (set COKE_ROOT)`;

/**
 * Tests that need something only some machines have. Where it is missing they are listed as skipped, with why in the
 * name, so a run that did not check them says so rather than passing quietly.
 */
export const describeWith = (missing: string | null, name: string, tests: () => void) =>
	missing === null ? describe(name, tests) : describe(name, () => it.skip(`not run: ${missing}`));
