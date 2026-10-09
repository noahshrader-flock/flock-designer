import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bundleCommand, esbuildEntry, runBundle, sharedFilesOf, writeBundleScript } from '../src/main/services/prototypeBundle';
import { statesOf } from '../src/shared/prototypeStates';

// The app's own React stands in for the product's installed packages; a one-file package stands in for its design system.
const appModules = join(__dirname, '..', 'node_modules');

describe('bundling a React prototype into one page', () => {
	let dir: string;
	let modules: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'fd-bundle-'));
		modules = join(dir, 'product', 'node_modules');
		mkdirSync(join(modules, '@acme', 'ds'), { recursive: true });
		writeFileSync(join(modules, '@acme', 'ds', 'package.json'), JSON.stringify({ name: '@acme/ds', main: 'index.js' }));
		writeFileSync(
			join(modules, '@acme', 'ds', 'index.js'),
			"const React = require('react');\nexports.DSButton = (p) => React.createElement('button', { className: 'ds-button' }, p.children);",
		);
		writeFileSync(join(modules, '@acme', 'ds', 'style.css'), '.ds-button { color: teal; }');
		// The product's own React, as an installed product has it.
		for (const pkg of ['react', 'react-dom', 'scheduler']) symlinkSync(join(appModules, pkg), join(modules, pkg));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('builds real components from the product packages into a single page, with its opening comment', async () => {
		const esbuild = esbuildEntry();
		expect(esbuild).not.toBeNull();
		const script = writeBundleScript(join(dir, 'prototype'));
		const entry = join(dir, 'prototype', 'demo', 'i1.tsx');
		mkdirSync(join(dir, 'prototype', 'demo'), { recursive: true });
		writeFileSync(
			entry,
			"/*\n * Usage tab, modelled on the Organization page.\n */\nimport '@acme/ds/style.css';\nimport { DSButton } from '@acme/ds';\nexport default function Prototype() { return <DSButton>Archive roles</DSButton>; }\n",
		);
		const out = join(dir, 'prototype', 'demo', 'i1.html');
		const r = await runBundle(script, esbuild as string, entry, out, modules, join(dir, 'shared'), process.execPath);
		expect(r).toMatchObject({ ok: true });
		expect(r.output).toMatch(/^Built i1\.html \(\d+ KB\)\.$/);
		const html = readFileSync(out, 'utf8');
		expect(html).toContain('<div id="root"></div>');
		expect(html).toContain('Usage tab, modelled on the Organization page.');
		expect(html).toMatch(/\.ds-button\s*\{\s*color:\s*teal/);
		expect(html).not.toMatch(/<script[^>]+src=/);
	});

	it('keeps a large embedded file once, by its content, and points the page at it; small ones stay in the page', async () => {
		const esbuild = esbuildEntry() as string;
		const script = writeBundleScript(join(dir, 'prototype'));
		const big = 'data:font/woff2;base64,' + 'A'.repeat(30000);
		const small = 'data:image/png;base64,' + 'B'.repeat(100);
		writeFileSync(join(modules, '@acme', 'ds', 'style.css'), `@font-face { font-family: X; src: url(${big}); } .logo { background: url("${small}"); }`);
		const entry = join(dir, 'prototype', 'i1.tsx');
		mkdirSync(join(dir, 'prototype'), { recursive: true });
		writeFileSync(entry, "import '@acme/ds/style.css';\nexport default () => null;\n");
		const shared = join(dir, 'shared');
		const r = await runBundle(script, esbuild, entry, join(dir, 'prototype', 'i1.html'), modules, shared, process.execPath);
		expect(r.ok).toBe(true);
		const html = readFileSync(join(dir, 'prototype', 'i1.html'), 'utf8');
		const names = sharedFilesOf(html);
		expect(names).toHaveLength(1);
		expect(readFileSync(join(shared, `${names[0]}.datauri`), 'utf8')).toBe(big);
		expect(html).not.toContain('A'.repeat(1000));
		expect(html).toContain('B'.repeat(100));
	});

	it('says what is wrong when the prototype does not compile, and writes nothing', async () => {
		const esbuild = esbuildEntry() as string;
		const script = writeBundleScript(join(dir, 'prototype'));
		const entry = join(dir, 'prototype', 'i1.tsx');
		writeFileSync(entry, "import { Missing } from '@acme/nothing';\nexport default () => <Missing />;\n");
		const r = await runBundle(script, esbuild, entry, join(dir, 'prototype', 'i1.html'), modules, join(dir, 'shared'), process.execPath);
		expect(r.ok).toBe(false);
		expect(r.output).toContain('@acme/nothing');
		expect(existsSync(join(dir, 'prototype', 'i1.html'))).toBe(false);
	});

	describe('the states it says it has', () => {
		const build = async (source: string) => {
			const script = writeBundleScript(join(dir, 'prototype'));
			const entry = join(dir, 'prototype', 'i1.tsx');
			const out = join(dir, 'prototype', 'i1.html');
			mkdirSync(join(dir, 'prototype'), { recursive: true });
			writeFileSync(entry, source);
			const r = await runBundle(script, esbuildEntry() as string, entry, out, modules, join(dir, 'shared'), process.execPath);
			return { ...r, html: existsSync(out) ? readFileSync(out, 'utf8') : null };
		};
		const page = 'export default function Prototype() { return null; }\n';

		it('are written into the page, in order, for the bar to offer', async () => {
			const r = await build(`export const states = ['default', 'filtered', "failed"] as const;\n${page}`);
			expect(r.ok).toBe(true);
			expect(statesOf(r.html as string)).toEqual(['default', 'filtered', 'failed']);
		});

		it('may be typed, and laid over several lines', async () => {
			const r = await build(`export const states: readonly string[] = [\n\t'default',\n\t'empty',\n];\n${page}`);
			expect(statesOf(r.html as string)).toEqual(['default', 'empty']);
		});

		it('are none when it says none', async () => {
			const r = await build(page);
			expect(r.html).not.toContain('dsnr-states');
		});

		it('fail the build, saying why, when the list is not plain names, or names one twice', async () => {
			for (const states of ["['default', 'Has Spaces']", "['default', 'no-match']", "['default', name]", "['default', 'empty', 'default']", '[]', 'makeStates()']) {
				const r = await build(`const name = 'x';\nexport const states = ${states};\n${page}`);
				expect(r.ok, states).toBe(false);
				expect(r.output).toContain('export const states');
				expect(r.output).toContain('one-word names');
				expect(r.html).toBeNull();
			}
		});
	});

	it('gives the agent one command it can run as it is', () => {
		expect(bundleCommand('/q/build-prototype.mjs', '/app/esbuild/main.js', '/q/a b/i1.tsx', '/q/i1.html', '/c/node_modules', '/q/_shared')).toBe(
			'node /q/build-prototype.mjs /app/esbuild/main.js "/q/a b/i1.tsx" /q/i1.html /c/node_modules /q/_shared',
		);
	});
});
