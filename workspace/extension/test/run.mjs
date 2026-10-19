/** Not part of `npm run check`: it opens a VS Code window for a minute. */
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { extensionDir, installVsix, packageVsix, vscodeApp, vscodeEnv } from '../tools.mjs';
import { sealedEnv } from '../../__tests__/sealed.mjs';

const here = join(extensionDir, 'test');
const extension = extensionDir;
const packaged = process.argv.includes('--packaged');
const base = mkdtempSync(join(tmpdir(), 'dsnrt-'));
const world = join(base, 'GitHub');

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' });
const repo = (dir, files) => {
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	}
	git(dir, 'init', '-q', '-b', 'main');
	git(dir, 'add', '.');
	git(dir, '-c', 'user.email=test@example.test', '-c', 'user.name=Test', 'commit', '-q', '-m', 'test');
};
// Neither repository has a remote, so nothing can be pushed.
const product = join(world, 'product');
repo(product, {
	'.dsnr/workspace.json': JSON.stringify({
		version: 1,
		product: 'Test Product',
		contextDir: '.dsnr',
		prototypeRoot: 'src/prototypes',
		branchPattern: { codebase: 'feature/<project-id>' },
		commands: [],
		designSystem: { package: 'x' },
	}),
});
writeFileSync(join(product, '.gitignore'), 'node_modules\n');
mkdirSync(join(product, 'node_modules/x'), { recursive: true });
writeFileSync(join(product, 'node_modules/x/package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
for (const m of ['react', 'react-dom', 'scheduler']) symlinkSync(join(extension, '../node_modules', m), join(product, 'node_modules', m));
// The stand-in Claude Code's page has enough on it to be pictured.
const bin = join(base, 'bin');
mkdirSync(bin);
writeFileSync(
	join(bin, 'claude'),
	`#!/bin/sh
if [ "$1" = auth ]; then echo '{"loggedIn":true}'; exit 0; fi
printf '%s\n' 'export default function Page() { return <main><h1 style={{ background: "#123", color: "#fff", padding: 160 }}>Made here</h1></main>; }' > v1.tsx
echo '{"type":"result","subtype":"success","result":"Built it."}'
`,
);
chmodSync(join(bin, 'claude'), 0o755);
const record = {
	projectId: 'fixture',
	name: 'v1',
	branch: 'prototype/fixture/v1',
	commit: null,
	createdAt: '2026-10-01T10:00:00Z',
	note: 'A test.',
};
repo(join(world, 'flock-designer'), {
	// A real design repository has these, so they are not read from GitHub.
	'skills/build-prototype.md': '# Build a prototype\n',
	// A run without it is refused.
	'agents/ui-guide.md': '# Building UI in a Flock product\n',
	'skills/record-the-route.md': '# Record where the work is\n',
	'standards/universal/accessibility.md': '# Accessibility\n',
	'projects/fixture/brief.md': '# Fixture\n',
	'projects/fixture/work.json': `${JSON.stringify([record], null, 2)}\n`,
	'projects/fixture/prototypes/v1.html':
		'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture</title></head><body><main><h1>Fixture</h1></main></body></html>\n',
});

// Fetches are pointed back at the local clone, never at GitHub.
const FUI_URL = 'https://github.com/flocksafety/flock-react-component-lib.git';
const fui = process.env.FUI_ROOT ?? join(extension, '../../../flock-react-component-lib');
const hasFui = (() => {
	try {
		execFileSync('git', ['-C', fui, 'rev-parse', '--verify', '--quiet', 'refs/remotes/origin/develop'], { stdio: 'ignore' });
		return existsSync(join(fui, 'node_modules'));
	} catch {
		return false;
	}
})();
if (hasFui) {
	const copy = join(world, 'x');
	execFileSync('git', ['init', '-q', copy]);
	git(copy, 'fetch', '-q', '--no-tags', fui, '+refs/remotes/origin/develop:refs/remotes/origin/develop');
	git(copy, 'remote', 'add', 'origin', FUI_URL);
	git(copy, 'config', `url.${fui}.insteadOf`, FUI_URL);
	// Fetched from the clone here, never pushed to it, nor to GitHub: insteadOf would send a push there too.
	git(copy, 'config', 'remote.origin.pushurl', 'no-push://dsnr-test');
	git(copy, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/develop');
	git(copy, 'checkout', '-q', '-b', 'develop', 'refs/remotes/origin/develop');
	symlinkSync(join(fui, 'node_modules'), join(copy, 'node_modules'));
} else console.log(`dsnr-test: no clone of the design system with develop and its packages at ${fui} (set FUI_ROOT): its part is not run`);

// The profile is throwaway too, its path short: VS Code keeps a socket in it.
const profile = { user: join(base, 'u'), extensions: join(base, 'e') };
// Packaged: the tests run from a bare runner of their own, which is all VS Code's test runner needs to be given.
let runner = extension;
if (packaged) {
	installVsix(packageVsix(), profile);
	runner = join(base, 'runner');
	mkdirSync(runner);
	writeFileSync(
		join(runner, 'package.json'),
		JSON.stringify({ name: 'dsnr-test-runner', publisher: 'flocksafety', version: '0.0.0', engines: { vscode: '^1.100.0' } }),
	);
}
const run = spawn(
	vscodeApp(),
	[
		product,
		`--extensionDevelopmentPath=${runner}`,
		`--extensionTestsPath=${join(here, 'activation.cjs')}`,
		`--user-data-dir=${profile.user}`,
		`--extensions-dir=${profile.extensions}`,
		'--disable-workspace-trust',
		'--skip-welcome',
		'--skip-release-notes',
		'--new-window',
	],
	{
		// Sealed (`sealed.mjs`), with the stand-in Claude Code first on the PATH.
		env: vscodeEnv({
			...sealedEnv({ base: join(base, 'sealed'), path: `${bin}:${process.env.PATH}` }).env,
			DSNR_TEST_PROFILE: profile.user,
			...(hasFui ? { DSNR_TEST_DESIGN_SYSTEM: '1' } : {}),
			...(packaged ? { DSNR_INSTALLED_IN: profile.extensions } : {}),
		}),
		stdio: ['ignore', 'pipe', 'pipe'],
	},
);
let said = '';
run.stdout.on('data', (d) => (said += d));
run.stderr.on('data', (d) => (said += d));
let timedOut = false;
const cap = setTimeout(() => {
	console.error('dsnr-test: VS Code did not finish within 300 s');
	timedOut = true;
	run.kill('SIGKILL');
}, 300_000);
run.on('exit', (status) => {
	clearTimeout(cap);
	// Retried: VS Code's extension host can still be finishing a write here a moment after its window has gone.
	rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
	const line = said.split('\n').find((l) => l.includes('dsnr-test:'));
	if (status === 0 && line) console.log(`${line.trim()}${packaged ? ' (installed from its package)' : ''}`);
	else
		console.error(
			`dsnr-test: failed (VS Code exited with ${status})\n${said
				.split('\n')
				// Stopped from outside, nothing said why: the last of what VS Code said, whole.
				.filter((l, i, all) => /assert|Error|dsnr-test/i.test(l) || (timedOut && i >= all.length - 40))
				.join('\n')}`,
		);
	process.exit(status === 0 && line ? 0 : 1);
});
