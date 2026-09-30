import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/**
 * Keeps every file operation inside the checkout the designer opened.
 *
 * This is the boundary the whole security posture rests on: the renderer can
 * name a path, so the main process must never take one on trust. `..`, an
 * absolute path to somewhere else, and a symlink pointing out of the tree all
 * have to fail, and the symlink is the one that string comparison misses.
 */

export class PathOutsideCheckout extends Error {
	constructor(requested: string, root: string) {
		super(`Refused: ${requested} is outside the opened repository (${root})`);
		this.name = 'PathOutsideCheckout';
	}
}

/** Resolves symlinks where the path exists, and leaves it alone where it does not. */
const realOrLexical = (path: string): string => {
	try {
		return realpathSync(path);
	} catch {
		// The path does not exist yet -- creating a file is legitimate. Its parent
		// still has to be inside, and resolving the parent catches a symlinked
		// directory pointing out of the tree.
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

/**
 * Returns an absolute path inside `root`, or throws.
 *
 * Use this on every path that came from outside the main process. There is no
 * variant that skips the check.
 */
export const resolveInside = (root: string, candidate: string): string => {
	if (!isInside(root, candidate)) {
		throw new PathOutsideCheckout(candidate, root);
	}
	return resolve(realOrLexical(resolve(root)), candidate);
};
