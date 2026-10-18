/**
 * The world every test and every hand check from this repository runs in, so none can reach the person's settings or
 * remotes, whoever writes it: a home of its own (the CLI's data folder, `gh`'s and any tool's settings are in it), no GitHub
 * token, a `gh` first on the PATH that refuses whatever it is asked, and git's own configuration (`gitconfig`), which also
 * sends every push to GitHub to a path that is not a repository. A test that needs `gh` puts its own stand-in first.
 *
 * One exception, asked for by name: a run of the real agent (`DSNR_REAL_AGENT=1`, which costs money and is never run by
 * `check`) keeps the person's home, where Claude Code is signed in. `gh` and pushes are refused all the same.
 */
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** What a refused `gh` says, and what a refused push's address names: how a test that was not sealed is told apart. */
export const NOT_FAKED = 'not faked';

const GITCONFIG = fileURLToPath(new URL('./gitconfig', import.meta.url));

/**
 * The environment, made in `base` (a new temporary folder unless one is given, as the dev window keeps its own): what to
 * set over the person's, `GH_TOKEN` and `GITHUB_TOKEN` emptied, which `gh` and every library read as none.
 */
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
