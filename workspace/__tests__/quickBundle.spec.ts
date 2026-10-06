import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bundleCommand, esbuildEntry, runBundle, writeBundleScript } from '../src/main/services/quickBundle';

// The app's own React stands in for the product's installed packages; a one-file package stands in for its design system.
const appModules = join(__dirname, '..', 'node_modules');

describe('bundling a React quick prototype into one page', () => {
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
		const script = writeBundleScript(join(dir, 'quick'));
		const entry = join(dir, 'quick', 'demo', 'q1.tsx');
		mkdirSync(join(dir, 'quick', 'demo'), { recursive: true });
		writeFileSync(
			entry,
			"/*\n * Usage tab, modelled on the Organization page.\n */\nimport '@acme/ds/style.css';\nimport { DSButton } from '@acme/ds';\nexport default function Prototype() { return <DSButton>Archive roles</DSButton>; }\n",
		);
		const out = join(dir, 'quick', 'demo', 'q1.html');
		const r = await runBundle(script, esbuild as string, entry, out, modules, process.execPath);
		expect(r).toMatchObject({ ok: true });
		expect(r.output).toMatch(/^Built q1\.html \(\d+ KB\)\.$/);
		const html = readFileSync(out, 'utf8');
		expect(html).toContain('<div id="root"></div>');
		expect(html).toContain('Usage tab, modelled on the Organization page.');
		expect(html).toMatch(/\.ds-button\s*\{\s*color:\s*teal/);
		expect(html).not.toMatch(/<script[^>]+src=/);
	});

	it('says what is wrong when the prototype does not compile, and writes nothing', async () => {
		const esbuild = esbuildEntry() as string;
		const script = writeBundleScript(join(dir, 'quick'));
		const entry = join(dir, 'quick', 'q1.tsx');
		writeFileSync(entry, "import { Missing } from '@acme/nothing';\nexport default () => <Missing />;\n");
		const r = await runBundle(script, esbuild, entry, join(dir, 'quick', 'q1.html'), modules, process.execPath);
		expect(r.ok).toBe(false);
		expect(r.output).toContain('@acme/nothing');
		expect(existsSync(join(dir, 'quick', 'q1.html'))).toBe(false);
	});

	it('gives the agent one command it can run as it is', () => {
		expect(bundleCommand('/q/build-quick.mjs', '/app/esbuild/main.js', '/q/a b/q1.tsx', '/q/q1.html', '/c/node_modules')).toBe(
			'node /q/build-quick.mjs /app/esbuild/main.js "/q/a b/q1.tsx" /q/q1.html /c/node_modules',
		);
	});
});
