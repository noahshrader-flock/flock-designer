/**
 * `npm run extension:test`: DSNR in the VS Code installed on this machine, on a throwaway world, checked as a person
 * meets it (`activation.cjs`). Not part of `npm run check`: it opens a VS Code window for a few seconds.
 *
 * The world is made here and removed after: a product with DSNR's setup and the design repository beside it, with one
 * project and one saved prototype, neither with a remote, so nothing can be pushed anywhere. The product has its design
 * system installed (a stand-in package, and React from this workspace, which a page is built with), and Claude Code is a
 * stand-in on the PATH that writes a page where the agent would, so a prototype is started and built with no agent run. The profile is throwaway
 * too, in the temporary folder (its path is short: VS Code keeps a socket in it), so the person's own VS Code is never
 * touched.
 */
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const extension = join(here, '..');
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
const product = join(world, 'product');
repo(product, {
	'.dsnr/workspace.json': JSON.stringify({
		version: 1,
		product: 'Test Product',
		contextDir: '.dsnr',
		prototypeRoot: 'src/prototypes',
		branchPattern: { prototype: 'fd/<project-id>/i<n>', codebase: 'feature/<project-id>' },
		commands: [],
		designSystem: { package: 'x' },
	}),
});
// Its design system installed, and what a page is built with, from this workspace.
writeFileSync(join(product, '.gitignore'), 'node_modules\n');
mkdirSync(join(product, 'node_modules/x'), { recursive: true });
writeFileSync(join(product, 'node_modules/x/package.json'), JSON.stringify({ name: 'x', version: '1.0.0' }));
for (const m of ['react', 'react-dom', 'scheduler']) symlinkSync(join(extension, '../node_modules', m), join(product, 'node_modules', m));
// Claude Code, standing in: signed in, and a run writes the page it was asked for where it runs (with enough on it to
// be pictured), then says it is done.
const bin = join(base, 'bin');
mkdirSync(bin);
writeFileSync(
	join(bin, 'claude'),
	`#!/bin/sh
if [ "$1" = auth ]; then echo '{"loggedIn":true}'; exit 0; fi
printf '%s\n' 'export default function Page() { return <main><h1 style={{ background: "#123", color: "#fff", padding: 160 }}>Made here</h1></main>; }' > v1-i1.tsx
echo '{"type":"result","subtype":"success","result":"Built it."}'
`,
);
chmodSync(join(bin, 'claude'), 0o755);
const record = {
	projectId: 'fixture',
	name: 'v1-i1',
	branch: 'prototype/fixture/v1-i1',
	commit: null,
	createdAt: '2026-10-01T10:00:00Z',
	note: 'A test.',
};
repo(join(world, 'flock-designer'), {
	// What a build gives the agent, standing in: a real design repository has them, so they are not read from GitHub.
	'skills/build-prototype.md': '# Build a prototype\n',
	'standards/universal/accessibility.md': '# Accessibility\n',
	'projects/fixture/brief.md': '# Fixture\n',
	'projects/fixture/iterations.json': `${JSON.stringify([record], null, 2)}\n`,
	'projects/fixture/prototypes/v1-i1.html':
		'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture</title></head><body><main><h1>Fixture</h1></main></body></html>\n',
});

const code = () => {
	if (process.env.CODE_BIN) return process.env.CODE_BIN;
	const mac = '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
	return existsSync(mac) ? mac : 'code';
};
const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
delete env.ELECTRON_RUN_AS_NODE;
const run = spawn(
	code(),
	[
		product,
		`--extensionDevelopmentPath=${extension}`,
		`--extensionTestsPath=${join(here, 'activation.cjs')}`,
		`--user-data-dir=${join(base, 'u')}`,
		`--extensions-dir=${join(base, 'e')}`,
		'--disable-workspace-trust',
		'--skip-welcome',
		'--skip-release-notes',
		'--new-window',
	],
	{ env, stdio: ['ignore', 'pipe', 'pipe'] },
);
let said = '';
run.stdout.on('data', (d) => (said += d));
run.stderr.on('data', (d) => (said += d));
const cap = setTimeout(() => {
	console.error('dsnr-test: VS Code did not finish within 180 s');
	run.kill('SIGKILL');
}, 180_000);
run.on('exit', (status) => {
	clearTimeout(cap);
	rmSync(base, { recursive: true, force: true });
	const line = said.split('\n').find((l) => l.includes('dsnr-test:'));
	if (status === 0 && line) console.log(line.trim());
	else
		console.error(
			`dsnr-test: failed (VS Code exited with ${status})\n${said
				.split('\n')
				.filter((l) => /assert|Error|dsnr-test/i.test(l))
				.join('\n')}`,
		);
	process.exit(status === 0 && line ? 0 : 1);
});
