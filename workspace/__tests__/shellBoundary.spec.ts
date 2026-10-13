import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Which shell the code is in (ELECTRON_MIGRATION_PLAN, Phase 1.3). The core (the services, the handlers, the host, the
 * shared domain, the window's screens) runs in whichever shell starts it, so nothing in it may reach `electron` or
 * `vscode`, directly or through what it imports. Only the shells' own files may: Electron's, listed here, and the VS Code
 * extension's, in `extension/`. Followed through every import that loads code; an `import type` loads nothing, so it is
 * not followed.
 */

const workspace = join(__dirname, '..');
const src = join(workspace, 'src');

/** Electron's own files: where the app meets Electron, and nothing else. Each is either the shell or one of its ports. */
const ELECTRON_SHELL = [
	'main/index.ts',
	'main/composition.ts',
	'main/ports.ts',
	'main/electronIpc.ts',
	'main/smokeLocal.ts',
	'main/smokePage.ts',
	'preload/index.ts',
	'main/services/sandboxedPage.ts',
	'main/services/pageView.ts',
	'main/services/storyMeasure.ts',
	'main/services/coverWindow.ts',
	'main/services/accessibilityWindow.ts',
].map((p) => join(src, p));

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
	const base = bare.startsWith('@/') ? join(src, 'renderer', bare.slice(2)) : bare.startsWith('.') ? resolve(dirname(from), bare) : null;
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
	const shell = new Set(ELECTRON_SHELL);

	it('names only files that are there', () => {
		expect(ELECTRON_SHELL.filter((p) => !existsSync(p)).map((p) => relative(src, p))).toEqual([]);
	});

	it('keeps the core out of every shell: nothing outside the shells reaches electron or vscode', () => {
		const reaching = files(src)
			.filter((f) => !shell.has(f))
			.map((f) => reachesShell(f, shell))
			.filter((chain): chain is string[] => chain !== null)
			.map((chain) => chain.join(' → '));
		expect(reaching).toEqual([]);
	});

	it('lets only the shells’ own files import electron', () => {
		const importing = files(src)
			.filter((f) => loads(readFileSync(f, 'utf8')).some((s) => /^electron(\/|$)/.test(s)))
			.map((f) => relative(src, f))
			.sort();
		expect(importing.every((f) => shell.has(join(src, f)))).toBe(true);
	});

	it('keeps Electron out of the VS Code extension', () => {
		const extension = join(workspace, 'extension');
		const sources = ['src', 'webview'].flatMap((d) => files(join(extension, d)));
		expect(sources.filter((f) => loads(readFileSync(f, 'utf8')).some((s) => /^electron(\/|$)/.test(s))).map((f) => relative(extension, f))).toEqual(
			[],
		);
	});
});
