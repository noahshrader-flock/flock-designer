import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** The one viewer build shared by the extension's package and `build-site`; only `outDir` differs. */
export const buildViewer = async (outDir) => {
	const { build } = await import('vite');
	await build({ configFile: join(here, 'viewer.vite.config.ts'), logLevel: 'warn', build: { outDir, emptyOutDir: true } });
	return outDir;
};
