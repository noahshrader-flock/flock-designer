import { existsSync, realpathSync } from 'node:fs';
import { delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path';

/**
 * Keeps every file operation inside the opened checkout: the security boundary, since a page can name a path. `..`, an
 * absolute path elsewhere and a symlink out of the tree must all fail; string comparison misses the symlink.
 */

/** Resolves symlinks where the path exists, and leaves it alone where it does not. */
const realOrLexical = (path: string): string => {
	try {
		return realpathSync(path);
	} catch {
		// Not there yet, as for a file being created.
		return resolve(path);
	}
};

export const isInside = (root: string, candidate: string): boolean => {
	const realRoot = realOrLexical(resolve(root));
	const realCandidate = realOrLexical(resolve(realRoot, candidate));
	if (realCandidate === realRoot) {
		return true;
	}
	const rel = relative(realRoot, realCandidate);
	return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel);
};

/** An absolute path inside `root`, or throws: for every path that came from outside the core. */
export const resolveInside = (root: string, candidate: string): string => {
	if (!isInside(root, candidate)) {
		throw new Error(`Refused: ${candidate} is outside the opened repository (${root})`);
	}
	return resolve(realOrLexical(resolve(root)), candidate);
};

/**
 * An executable on the PATH, or null. An app opened from the Dock has none of a terminal's
 * PATH, so callers also check the usual install places themselves.
 */
export const findOnPath = (name: string, env: NodeJS.ProcessEnv = process.env, exists: (p: string) => boolean = existsSync): string | null => {
	for (const dir of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
		if (exists(join(dir, name))) return join(dir, name);
	}
	return null;
};
