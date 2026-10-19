/**
 * So no test or hand check can reach the person's settings or remotes: a home of its own, no GitHub token, a `gh` first on
 * the PATH that refuses everything, and `gitconfig`, which sends every push to GitHub to a path that is not a repository.
 * A test that needs `gh` puts its own stand-in first.
 *
 * One exception: `DSNR_REAL_AGENT=1` (costs money, never run by `check`) keeps the person's home, where Claude Code is
 * signed in. `gh` and pushes are refused all the same.
 */
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** What a refused `gh` says, and what a refused push's address names: how a test that was not sealed is told apart. */
export const NOT_FAKED = 'not faked';

const GITCONFIG = fileURLToPath(new URL('./gitconfig', import.meta.url));

/** What to set over the person's environment. `GH_TOKEN` and `GITHUB_TOKEN` are emptied, which `gh` and every library read as none. */
export const sealedEnv = ({ base = mkdtempSync(join(tmpdir(), 'dsnr-sealed-')), path = process.env.PATH ?? '' } = {}) => {
	const home = join(base, 'home');
	const bin = join(base, 'bin');
	mkdirSync(join(home, '.config'), { recursive: true });
	mkdirSync(bin, { recursive: true });
	writeFileSync(join(bin, 'gh'), `#!/bin/sh\necho "gh is ${NOT_FAKED} here: gh $*" >&2\nexit 1\n`);
	chmodSync(join(bin, 'gh'), 0o755);
	const keepHome = process.env.DSNR_REAL_AGENT === '1';
	return {
		base,
		env: {
			...(keepHome ? {} : { HOME: home, XDG_CONFIG_HOME: join(home, '.config') }),
			GH_CONFIG_DIR: join(home, '.config', 'gh'),
			GH_TOKEN: '',
			GITHUB_TOKEN: '',
			PATH: `${bin}:${path}`,
			GIT_CONFIG_GLOBAL: GITCONFIG,
			GIT_CONFIG_NOSYSTEM: '1',
		},
	};
};
