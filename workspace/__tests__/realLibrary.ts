import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import { chromeHeadless } from '../src/core/services/chromeHeadless';
import { ComponentTokens } from '../src/core/services/componentTokens';
import type { Measure } from '../src/core/services/componentTokens';
import { PrototypeServer } from '../src/core/services/prototypeServer';
import { StoryPreviews } from '../src/core/services/storyPreviews';
import type { ConnectedDesignSystem } from '../src/shared/contract';
import { describeWith } from './realCheckouts';

/** What reads a real library, as the app wires it: its previews, its tokens and values, and the browser that draws them. */
export interface RealLibrary {
	previews: StoryPreviews;
	tokens: ComponentTokens;
	measure: Measure;
}

/**
 * Where a library's previews are built, kept between runs: a build is kept for its commit, so the next run starts from it.
 * One test file at a time uses it (the `library` project), so no two builds share it at once.
 */
export const libraryFolder = (system: ConnectedDesignSystem): string => join(tmpdir(), 'dsnr-libraries', system.id.replace(/[^\w.-]+/g, '-'));

/**
 * Each library, drawn once for the whole run: the `library` project keeps one worker's modules from file to file, so every
 * test of a library reads the same drawing. Its browser is closed after each block (`describeLibrary`) and started again
 * when a later one draws, so none is left running when the run ends; the drawing is kept, in memory.
 */
const opened = new Map<string, Promise<RealLibrary & { closeBrowser: () => Promise<void> }>>();
const open = (system: ConnectedDesignSystem): Promise<RealLibrary & { closeBrowser: () => Promise<void> }> => {
	const kept = opened.get(system.id);
	if (kept) return kept;
	const library = (async () => {
		const started = Date.now();
		console.log(`library: drawing ${system.name}, every story, tagged and plain…`);
		const real = chromeHeadless();
		const previews = new StoryPreviews({ system: () => system, folder: libraryFolder(system), server: new PrototypeServer() });
		const tokens = new ComponentTokens({ system: () => system, previews, measure: real.measure, pictures: { keep: () => {}, of: async () => ({}) } });
		await tokens.warm();
		console.log(`library: ${system.name} drawn in ${Math.round((Date.now() - started) / 1000)}s`);
		return { previews, tokens, measure: real.measure, closeBrowser: real.close };
	})();
	opened.set(system.id, library);
	return library;
};

/** `check` on a real library on this machine (`realCheckouts.ts`), drawn in real Chrome, with its index drawn as the tab draws it. */
export const onRealLibrary = async (system: ConnectedDesignSystem, check: (library: RealLibrary) => Promise<void>): Promise<void> =>
	check(await open(system));

/**
 * Tests on a real library, run where it is (`describeWith`), with its first drawing in the block's set-up: so it is not counted
 * against a test's five minutes, and is said as it happens.
 */
export const describeLibrary = (missing: string | null, system: ConnectedDesignSystem, name: string, tests: () => void) =>
	describeWith(missing, name, () => {
		beforeAll(async () => void (await open(system)));
		afterAll(async () => (await open(system)).closeBrowser());
		tests();
	});
