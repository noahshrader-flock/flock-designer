import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it } from 'vitest';
import type { CatalogReads } from '../src/core/services/designSystem/componentCatalog';
import { libraryCommit, systemReads } from '../src/core/services/designSystem/designLibrary';
import type { ConnectedDesignSystem } from '../src/shared/contract';

/** Real repositories, never written to and never assumed to be here: found by their variable, or beside this repository. */
const beside = (name: string) => resolve(__dirname, '..', '..', '..', name);

export const REAL_LIBRARY = process.env.FUI_ROOT ?? beside('flock-react-component-lib');
export const REAL_PRIMER = process.env.PRIMER_ROOT ?? beside('primer-react');
/** Tremor's libraries put their values in Tailwind classes: one on Tailwind 3, one on Tailwind 4. */
export const REAL_TREMOR3 = process.env.TREMOR3_ROOT ?? beside('tremor-npm');
export const REAL_TREMOR4 = process.env.TREMOR4_ROOT ?? beside('tremor-raw');
export const REAL_COKE = process.env.COKE_ROOT ?? beside('flock-coke');

export const realDevelop = ((): string | null => {
	if (!existsSync(join(REAL_LIBRARY, '.git'))) return null;
	try {
		return execFileSync('git', ['-C', REAL_LIBRARY, 'rev-parse', '--verify', '--quiet', 'refs/remotes/origin/develop'], { encoding: 'utf8' }).trim();
	} catch {
		return null;
	}
})();

export const libraryMissing = realDevelop === null ? `no clone of the design system with develop at ${REAL_LIBRARY} (set FUI_ROOT)` : null;
export const libraryUnbuilt =
	libraryMissing ??
	(existsSync(join(REAL_LIBRARY, 'node_modules', '@storybook', 'react', 'package.json')) ? null : `${REAL_LIBRARY} has no packages installed`);
export const REAL_FUI = {
	id: 'flocksafety/flock-react-component-lib',
	name: 'FUI',
	repository: 'flocksafety/flock-react-component-lib',
	root: REAL_LIBRARY,
	folder: '',
	branch: 'develop',
};
export const REAL_PRIMER_SYSTEM = {
	id: 'primer/react',
	name: 'Primer',
	repository: 'primer/react',
	root: REAL_PRIMER,
	folder: 'packages/react',
	branch: 'main',
};
const tremor = (repository: string, root: string) => ({ id: repository, name: repository, repository, root, folder: '', branch: 'main' });
export const REAL_TREMOR3_SYSTEM = tremor('tremorlabs/tremor-npm', REAL_TREMOR3);
export const REAL_TREMOR4_SYSTEM = tremor('tremorlabs/tremor', REAL_TREMOR4);
export const primerMissing = existsSync(join(REAL_PRIMER, 'node_modules', '@storybook', 'react', 'package.json'))
	? null
	: `no clone of primer/react with its packages installed at ${REAL_PRIMER} (set PRIMER_ROOT)`;
const tremorMissing = (root: string, name: string): string | null =>
	existsSync(join(root, 'node_modules', '@storybook', 'react', 'package.json')) ? null : `no clone of ${name} with its packages installed at ${root}`;
export const tremor3Missing = tremorMissing(REAL_TREMOR3, 'tremorlabs/tremor-npm (set TREMOR3_ROOT)');
export const tremor4Missing = tremorMissing(REAL_TREMOR4, 'tremorlabs/tremor (set TREMOR4_ROOT)');
export const cokeMissing = existsSync(join(REAL_COKE, '.dsnr', 'workspace.json'))
	? null
	: `no Coke checkout with a descriptor at ${REAL_COKE} (set COKE_ROOT)`;

/** Skipped with why in the name, so a run that did not check them says so rather than passing quietly. */
export const describeWith = (missing: string | null, name: string, tests: () => void) =>
	missing === null ? describe(name, tests) : describe(name, () => it.skip(`not run: ${missing}`));

/**
 * Every real library a test can run on: one that is not here is said by its row's test, never passed quietly. `tokens`
 * is false for one that writes none DSNR reads (Tremor 3 keeps its theme in Tailwind 3's config).
 */
export const EVERY_LIBRARY: { key: string; system: ConnectedDesignSystem; missing: string | null; tokens: boolean }[] = [
	{ key: 'FUI', system: REAL_FUI, missing: libraryUnbuilt, tokens: true },
	{ key: 'Primer', system: REAL_PRIMER_SYSTEM, missing: primerMissing, tokens: true },
	{ key: 'Tremor3', system: REAL_TREMOR3_SYSTEM, missing: tremor3Missing, tokens: false },
	{ key: 'Tremor4', system: REAL_TREMOR4_SYSTEM, missing: tremor4Missing, tokens: true },
];

/** The library's files at the tip of its branch, as DSNR reads them. */
export const readsOf = async (system: ConnectedDesignSystem): Promise<CatalogReads> => {
	const commit = await libraryCommit(system.root, system.branch);
	if (commit === null) throw new Error(`${system.name} has no ${system.branch} from origin`);
	return systemReads(system, commit);
};
