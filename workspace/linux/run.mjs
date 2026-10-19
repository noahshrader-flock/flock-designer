// `npm run test:linux -- <command>`: the command in the workspace on a Linux like CI's, from this working tree as it is.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(workspace, '..');
const command = process.argv.slice(2);
if (command.length === 0) {
	console.error('Say what to run, as: npm run test:linux -- npx vitest run --project integration chromeHeadless');
	process.exit(2);
}

// CI's own versions, read where CI reads them, so the two cannot differ.
const node = readFileSync(join(workspace, '.nvmrc'), 'utf8').trim();
const vscode = /VSCODE_VERSION: (\S+)/.exec(readFileSync(join(repo, '.github/workflows/ci.yml'), 'utf8'))?.[1];
if (!vscode) throw new Error('No VSCODE_VERSION in .github/workflows/ci.yml');

const image = 'dsnr-linux';
const build = ['build', '--platform', 'linux/amd64', '-t', image, '--build-arg', `NODE_MAJOR=${node}`, '--build-arg', `VSCODE_VERSION=${vscode}`];
execFileSync('docker', [...build, join(workspace, 'linux')], { stdio: ['ignore', 'ignore', 'inherit'] });

// A copy of the tree (tracked and new files, as git sees them) with its own packages: the Mac's are never touched.
const inside = `cd /src && git ls-files -co --exclude-standard -z | tar --null -T - -cf - | tar -xf - -C /work && cp -a .git /work/
cd /work/workspace && npm ci --no-audit --no-fund --loglevel=error >/dev/null
echo "linux: node $(node --version), $(google-chrome --version), $(nproc) CPUs"
exec "$@"`;
const run = spawnSync(
	'docker',
	[
		'run',
		'--rm',
		'--platform',
		'linux/amd64',
		// The runner's size, and room for Chrome's shared memory and its sandbox.
		'--cpus',
		'4',
		'--memory',
		'16g',
		'--shm-size',
		'2g',
		'--security-opt',
		'seccomp=unconfined',
		'-v',
		`${repo}:/src:ro`,
		'-v',
		'dsnr-linux-npm:/home/runner/.npm',
		image,
		'bash',
		'-c',
		inside,
		'--',
		...command,
	],
	{ stdio: 'inherit' },
);
process.exit(run.status ?? 1);
