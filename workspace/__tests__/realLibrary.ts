import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromeHeadless } from '../src/main/services/chromeHeadless';
import { ComponentTokens } from '../src/main/services/componentTokens';
import type { Measure } from '../src/main/services/componentTokens';
import { PrototypeServer } from '../src/main/services/prototypeServer';
import { StoryPreviews } from '../src/main/services/storyPreviews';
import type { ConnectedDesignSystem } from '../src/shared/contract';

/** What reads a real library, as the app wires it: its previews, its tokens and values, and the browser that draws them. */
export interface RealLibrary {
	previews: StoryPreviews;
	tokens: ComponentTokens;
	measure: Measure;
}

/**
 * `check` on a real library on this machine (`realCheckouts.ts`), drawn in real Chrome, with its index warmed as the tab
 * warms it; the browser and the server are closed after, whatever `check` ends in.
 */
export const onRealLibrary = async (system: ConnectedDesignSystem, check: (library: RealLibrary) => Promise<void>): Promise<void> => {
	const pages = new PrototypeServer();
	const real = chromeHeadless();
	try {
		const previews = new StoryPreviews({ system: () => system, folder: mkdtempSync(join(tmpdir(), 'dsnr-real-')), server: pages });
		const tokens = new ComponentTokens({ system: () => system, previews, measure: real.measure, pictures: { keep: () => {}, of: async () => ({}) } });
		await tokens.warm();
		await check({ previews, tokens, measure: real.measure });
	} finally {
		await real.close();
		pages.close();
	}
};
