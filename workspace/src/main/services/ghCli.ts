import { existsSync } from 'node:fs';
import type { GitHubApi } from './designRepo';
import { findOnPath } from './paths';
import { ProcessFailed, runFile } from './process';

/** How long one call may take before it is given up on: a stuck one must not hold a screen. */
const CALL_TIMEOUT_MS = 60_000;

/** The GitHub CLI: on the PATH, or where it is usually installed (an app opened from the Dock has no PATH). */
export const locateGh = (env: NodeJS.ProcessEnv = process.env, exists: (p: string) => boolean = existsSync): string =>
	findOnPath('gh', env, exists) ?? ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'].find((p) => exists(p)) ?? 'gh';

/**
 * GitHub's API through its own command line, `gh`, signed in as the person: what their account can reach, every
 * organization's repositories included. The app's own sign-in is a GitHub App, which GitHub lets see only the
 * repositories it is installed on; the command line is not limited that way. Used by the `dsnr` command, and by the app
 * to list the repositories a design system can be connected from, and by sharing (`shareTools.ts`) to find it. Fails, as
 * GitHub would, when `gh` is missing or signed out, and after a minute rather than hanging.
 */
export const ghApi = (bin: string = locateGh()): GitHubApi => ({
	api: async (path, init = {}) => {
		const args = ['api', path, ...(init.method ? ['--method', init.method] : []), ...(init.body !== undefined ? ['--input', '-'] : [])];
		const input = init.body !== undefined ? JSON.stringify(init.body) : undefined;
		const { stdout } = await runFile(bin, args, { maxBuffer: 64 * 1024 * 1024, timeoutMs: CALL_TIMEOUT_MS, input }).catch((err: unknown) => {
			// What GitHub said, and its status, so a 404 can be told from anything else.
			if (err instanceof ProcessFailed)
				throw Object.assign(new Error(err.message), { status: Number(/HTTP (\d{3})/.exec(err.stderr)?.[1]) || undefined });
			throw err;
		});
		return stdout.trim() ? (JSON.parse(stdout) as unknown) : null;
	},
});
