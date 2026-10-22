import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRemote } from '../../../shared/repoRef';

/**
 * The `origin` remote's URL from a clone's `.git/config`, or null: no process, for scanning many folders. It does not
 * apply `insteadOf` or follow a worktree's `.git` file; for one repository, ask git (`originUrl`).
 */
export const originOf = (root: string, read: (path: string) => string = (p) => readFileSync(p, 'utf8')): string | null => {
	let config: string;
	try {
		config = read(join(root, '.git', 'config'));
	} catch {
		return null;
	}
	const section = /\[remote "origin"\]([^[]*)/.exec(config)?.[1] ?? '';
	return /^\s*url\s*=\s*(.+)$/m.exec(section)?.[1]?.trim() ?? null;
};

export const repositoryAt = (root: string): string | null => {
	const origin = originOf(root);
	return origin === null ? null : parseRemote(origin);
};
