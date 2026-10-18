import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The viewer a prototype's page carries (its review bar and comments), built the one way for every build: the extension's,
 * into its package, and the command line's `build-site`, into `out/viewer`. Only where it goes differs. Vite is loaded when
 * this is called, as the builds load their tools.
 */
export const buildViewer = async (outDir) => {
	const { build } = await import('vite');
	await build({ configFile: join(here, 'viewer.vite.config.ts'), logLevel: 'warn', build: { outDir, emptyOutDir: true } });
	return outDir;
};
