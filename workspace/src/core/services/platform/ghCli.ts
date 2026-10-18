import { existsSync } from 'node:fs';
import type { GitHubApi } from '../../../github/github';

import { findOnPath } from './paths';
import { errorText } from '../../../shared/result';
import { HostError } from '../../../github/hostError';
import { NotInstalled, ProcessFailed, runFile } from './process';

/** How long one call may take before it is given up on: a stuck one must not hold a screen. */
const CALL_TIMEOUT_MS = 60_000;

/** The GitHub CLI: on the PATH, or where it is usually installed (an app opened from the Dock has no PATH). */
export const locateGh = (env: NodeJS.ProcessEnv = process.env, exists: (p: string) => boolean = existsSync): string =>
	findOnPath('gh', env, exists) ?? ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'].find((p) => exists(p)) ?? 'gh';

/**
 * A failed `gh` run as the host error it is: its status read from what it printed (`gh: Not Found (HTTP 404)`), else
 * missing, signed out, or out of time, as `gh` says each.
 */
export const ghError = (err: unknown): HostError => {
	if (err instanceof NotInstalled) return new HostError(err.message, undefined, 'missingCli');
	if (!(err instanceof ProcessFailed)) return new HostError(errorText(err), undefined, 'failed');
	const status = Number(/HTTP (\d{3})/.exec(err.stderr)?.[1]) || undefined;
	if (status !== undefined) return new HostError(err.message, status);
	if (/gh auth login|not logged in/i.test(err.message)) return new HostError(err.message, undefined, 'reauth');
	return new HostError(err.message, undefined, err.timedOut ? 'unreachable' : 'failed');
};

/**
 * GitHub's API through its own command line, `gh`, signed in as the person: what their account can reach, every
 * organization's repositories included. The app's own sign-in is a GitHub App, which GitHub lets see only the
 * repositories it is installed on; the command line is not limited that way. Used by the `dsnr` command, and by the app
 * to list the repositories a design system can be connected from, and by sharing and the voice and tone, whose pull
 * requests and saves are the person's own. Fails, as
 * GitHub would, when `gh` is missing or signed out, and after a minute rather than hanging.
 */
export const ghApi = (bin: string = locateGh()): GitHubApi => ({
	api: async (path, init = {}) => {
		const args = ['api', path, ...(init.method ? ['--method', init.method] : []), ...(init.body !== undefined ? ['--input', '-'] : [])];
		const input = init.body !== undefined ? JSON.stringify(init.body) : undefined;
		const { stdout } = await runFile(bin, args, { maxBuffer: 64 * 1024 * 1024, timeoutMs: CALL_TIMEOUT_MS, input }).catch((err: unknown) => {
			throw ghError(err);
		});
		return stdout.trim() ? (JSON.parse(stdout) as unknown) : null;
	},
});
