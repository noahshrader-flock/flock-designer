import { execFile } from 'node:child_process';
import type { GitHubApi } from './designRepo';

/**
 * GitHub's API through its own command line, `gh`, signed in as the person: what their account can reach, every
 * organisation's repositories included. The app's own sign-in is a GitHub App, which GitHub lets see only the
 * repositories it is installed on; the command line is not limited that way. Used by the `dsnr` command, and by the app
 * to list the repositories a design system can be connected from. Fails, as GitHub would, when `gh` is missing or signed out.
 */
export const ghApi = (): GitHubApi => ({
	api: (path, init = {}) =>
		new Promise((done, fail) => {
			const args = ['api', path, ...(init.method ? ['--method', init.method] : []), ...(init.body !== undefined ? ['--input', '-'] : [])];
			const child = execFile('gh', args, { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
				// What GitHub said, and its status, so a 404 can be told from anything else.
				if (err) return fail(Object.assign(new Error(stderr.trim() || err.message), { status: Number(/HTTP (\d{3})/.exec(stderr)?.[1]) || undefined }));
				if (!stdout.trim()) return done(null);
				try {
					done(JSON.parse(stdout));
				} catch (e) {
					fail(e);
				}
			});
			if (init.body !== undefined) child.stdin?.end(JSON.stringify(init.body));
		}),
});
