import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll } from 'vitest';
import { chromeHeadless } from '../src/core/services/browser/chromeHeadless';
import { ComponentTokens } from '../src/core/services/designSystem/componentTokens';
import type { Measure } from '../src/core/ports';
import { PrototypeServer } from '../src/core/services/prototypes/prototypeServer';
import { StoryPreviews } from '../src/core/services/designSystem/storyPreviews';
import type { ConnectedDesignSystem } from '../src/shared/contract';
import { describeWith } from './realCheckouts';

export interface RealLibrary {
	previews: StoryPreviews;
	tokens: ComponentTokens;
	measure: Measure;
}

/** Kept between runs; one test file at a time uses it (the `library` project), so no two builds share it at once. */
export const libraryFolder = (system: ConnectedDesignSystem): string => join(tmpdir(), 'dsnr-libraries', system.id.replace(/[^\w.-]+/g, '-'));

/**
 * Drawn once for the whole run: the `library` project keeps one worker's modules from file to file. Its browser is closed
 * after each block (`describeLibrary`), so none is left running when the run ends; the drawing is kept, in memory.
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

export const onRealLibrary = async (system: ConnectedDesignSystem, check: (library: RealLibrary) => Promise<void>): Promise<void> =>
	check(await open(system));

/** The first drawing is in the block's set-up, so it is not counted against a test's five minutes. */
export const describeLibrary = (missing: string | null, system: ConnectedDesignSystem, name: string, tests: () => void) =>
	describeWith(missing, name, () => {
		beforeAll(async () => void (await open(system)));
		afterAll(async () => (await open(system)).closeBrowser());
		tests();
	});
