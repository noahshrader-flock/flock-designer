import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `@/` is the viewer's code (`src/viewer`), for every build and the tests alike, as `tsconfig.base.json` says it, the one
 * place it is written: read from there, so the two cannot differ. shadcn's command line reads it there too.
 */
const paths = (JSON.parse(readFileSync(resolve(__dirname, 'tsconfig.base.json'), 'utf8')) as { compilerOptions: { paths: Record<string, string[]> } })
	.compilerOptions.paths;
export const alias = { '@': resolve(__dirname, (paths['@/*'] as string[])[0]!.replace(/\/\*$/, '')) };
