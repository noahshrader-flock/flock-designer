import { join } from 'node:path';
import { fileAt, hasFileAt } from '../platform/git';
import { readJsonObject } from '../platform/jsonFile';

/** A package's package.json as installed in `nodeModules`; null when it is not there, or cannot be read. */
export const installedPackage = (nodeModules: string, pkg: string): Record<string, unknown> | null =>
	readJsonObject(join(nodeModules, ...pkg.split('/'), 'package.json'));

/** A package's version as installed in `nodeModules`; null when it is not there, or its package.json says none. */
export const installedVersion = (nodeModules: string, pkg: string): string | null => {
	const version = installedPackage(nodeModules, pkg)?.version;
	return typeof version === 'string' ? version : null;
};

/** npm's, the one form read; the others are named, so they are said rather than guessed at. */
const NPM_LOCKS = ['package-lock.json', 'npm-shrinkwrap.json'];
const OTHER_LOCKS = ['yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb'];

/** What a commit's lockfile pins `pkg` at, read with git, never from the working tree; else why that cannot be told. */
export const pinnedAt = async (root: string, commit: string, pkg: string): Promise<{ version: string } | { unknown: string }> => {
	for (const name of NPM_LOCKS) {
		const lock = await fileAt(root, commit, name);
		if (lock === null) continue;
		let parsed: { packages?: Record<string, { version?: unknown }>; dependencies?: Record<string, { version?: unknown }> };
		try {
			parsed = JSON.parse(lock.text) as typeof parsed;
		} catch {
			return { unknown: `its ${name} cannot be read` };
		}
		// Lockfile versions 2 and 3 list installed paths; version 1 only dependencies.
		const version = parsed.packages?.[`node_modules/${pkg}`]?.version ?? parsed.dependencies?.[pkg]?.version;
		return typeof version === 'string' ? { version } : { unknown: `its ${name} has no entry for ${pkg}` };
	}
	for (const name of OTHER_LOCKS) if (await hasFileAt(root, commit, name)) return { unknown: `its lockfile is ${name}, which DSNR does not read` };
	return { unknown: 'it has no lockfile' };
};

/**
 * The design system as installed against what the base commit's lockfile pins, in words, before anything is built on it;
 * null when they are the same, or nothing is installed (which readiness says). Never a certainty: a lockfile can be read
 * wrongly (a workspace, an alias, a patched package), so a difference "may not match". DSNR never installs: `install` is
 * the product's own command, for the person to run.
 */
export const installedAgainstBase = async ({
	root,
	commit,
	branch,
	pkg,
	installed,
	install,
}: {
	root: string;
	commit: string;
	branch: string;
	pkg: string;
	installed: string | null;
	install: string | null;
}): Promise<string | null> => {
	if (installed === null) return null;
	const pinned = await pinnedAt(root, commit, pkg);
	if ('unknown' in pinned) return `Whether ${pkg} ${installed}, as installed here, is the one ${branch} uses is not known: ${pinned.unknown}.`;
	if (pinned.version === installed) return null;
	return `${branch} pins ${pkg} ${pinned.version}, and ${installed} is installed here, so the prototype may not match ${branch}: it is built against ${installed}. To match, install ${branch}'s packages${install ? ` (\`${install}\`)` : ''}.`;
};
