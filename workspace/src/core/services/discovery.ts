import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where a product repository's design records live: the design repository
 * cloned beside it. Null when it is not there, which DSNR reports rather
 * than creating a folder outside any repository.
 */
export const recordsRootFor = (productRoot: string, exists: (p: string) => boolean = existsSync): string | null => {
	const sibling = join(productRoot, '..', 'flock-designer');
	return exists(join(sibling, '.git')) ? join(sibling, 'projects') : null;
};
