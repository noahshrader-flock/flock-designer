import { existsSync } from 'node:fs';
import type { GitHubApi } from '../../../codeHost/github';

import { findOnPath } from './paths';
import { errorText } from '../../../shared/result';
import { HostError } from '../../../codeHost/hostError';
import { NotInstalled, ProcessFailed, runFile } from './process';

/** How long one call may take before it is given up on: a stuck one must not hold a screen. */
const CALL_TIMEOUT_MS = 60_000;

/** The GitHub CLI: on the PATH, or where it is usually installed (an app opened from the Dock has no PATH). */
export const locateGh = (env: NodeJS.ProcessEnv = process.env, exists: (p: string) => boolean = existsSync): string =>
	findOnPath('gh', env, exists) ?? ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'].find((p) => exists(p)) ?? 'gh';

export const ghError = (err: unknown): HostError => {
	if (err instanceof NotInstalled) return new HostError(err.message, undefined, 'missingCli');
	if (!(err instanceof ProcessFailed)) return new HostError(errorText(err), undefined, 'failed');
	const status = Number(/HTTP (\d{3})/.exec(err.stderr)?.[1]) || undefined;
	if (status !== undefined) return new HostError(err.message, status);
	if (/gh auth login|not logged in/i.test(err.message)) return new HostError(err.message, undefined, 'reauth');
	return new HostError(err.message, undefined, err.timedOut ? 'unreachable' : 'failed');
};

/**
 * Through `gh`, signed in as the person, so it reaches every repository their account can, which a GitHub App sign-in
 * (installed repositories only) cannot.
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
