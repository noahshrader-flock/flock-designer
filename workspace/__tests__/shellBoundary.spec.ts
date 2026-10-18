import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Which shell the code is in. The core (the services, the handlers, the host, the shared domain, the viewer's parts) runs in
 * whichever shell starts it, so nothing in it may reach `vscode`, directly or through what it imports; only the VS Code
 * extension's own files, in `extension/`, may. DSNR was an Electron app too, until 2026-10-15; nothing loads `electron`
 * any more, and this keeps it so. Followed through every import that loads code; an `import type` loads nothing, so it is
 * not followed.
 */

const workspace = join(__dirname, '..');
const src = join(workspace, 'src');

const files = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
	});

/** What a file loads when it runs: its imports and re-exports that are not type-only, and its dynamic imports. */
const loads = (text: string): string[] => {
	const found: string[] = [];
	for (const m of text.matchAll(/^\s*import\s+(type\s+)?([\s\S]*?)\s*from\s+['"]([^'"]+)['"]/gm)) if (!m[1]) found.push(m[3] as string);
	for (const m of text.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) found.push(m[1] as string);
	for (const m of text.matchAll(/^\s*export\s+(type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/gm)) if (!m[1]) found.push(m[2] as string);
	for (const m of text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) found.push(m[1] as string);
	return found;
};

/** A relative or `@/` import as the file it names, or null for a package. */
const fileOf = (from: string, spec: string): string | null => {
	const bare = spec.replace(/\?.*$/, '');
	const base = bare.startsWith('@/') ? join(src, 'viewer', bare.slice(2)) : bare.startsWith('.') ? resolve(dirname(from), bare) : null;
	if (base === null) return null;
	return [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find((p) => existsSync(p) && statSync(p).isFile()) ?? null;
};

const SHELL_PACKAGES = /^(electron|vscode)(\/|$)/;

/** The chain from `start` to a shell's package, or null when it reaches none. */
const reachesShell = (start: string, stopAt: Set<string>): string[] | null => {
	const seen = new Set<string>();
	const walk = (file: string, path: string[]): string[] | null => {
		if (seen.has(file)) return null;
		seen.add(file);
		for (const spec of loads(readFileSync(file, 'utf8'))) {
			if (SHELL_PACKAGES.test(spec)) return [...path, spec];
			const next = fileOf(file, spec);
			if (next === null) continue;
			if (stopAt.has(next)) return [...path, relative(src, next)];
			const found = walk(next, [...path, relative(src, next)]);
			if (found) return found;
		}
		return null;
	};
	return walk(start, [relative(src, start)]);
};

describe('the shell boundary', () => {
	it('keeps the core out of every shell: nothing in src reaches electron or vscode', () => {
		const reaching = files(src)
			.map((f) => reachesShell(f, new Set()))
			.filter((chain): chain is string[] => chain !== null)
			.map((chain) => chain.join(' → '));
		expect(reaching).toEqual([]);
	});

	it('has no file that imports electron, in the core or in the extension: the app is gone', () => {
		const importing = [...files(src), ...['src', 'webview'].flatMap((d) => files(join(workspace, 'extension', d)))]
			.filter((f) => loads(readFileSync(f, 'utf8')).some((s) => /^electron(\/|$)/.test(s)))
			.map((f) => relative(workspace, f))
			.sort();
		expect(importing).toEqual([]);
	});

	it('declares no electron package: not as a dependency, and no script that runs it', () => {
		const pkg = JSON.parse(readFileSync(join(workspace, 'package.json'), 'utf8')) as {
			main?: string;
			scripts: Record<string, string>;
			dependencies?: Record<string, string>;
			devDependencies?: Record<string, string>;
		};
		const all = { ...pkg.dependencies, ...pkg.devDependencies };
		expect(Object.keys(all).filter((n) => /^electron(-|$)/.test(n))).toEqual([]);
		expect(Object.values(pkg.scripts).filter((c) => /electron/.test(c))).toEqual([]);
		expect(pkg.main).toBeUndefined();
	});
});
