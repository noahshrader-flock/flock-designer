import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isSiteSource } from '../src/main/services/pages';

const workspace = resolve(__dirname, '..');
const repository = resolve(workspace, '..');

/**
 * Every file the published viewer is built from, found from its folder by following imports: relative ones, and `@/`,
 * the window's code (`alias.config.ts`). A file is what a deploy is marked behind for, so a move that takes one out of
 * `SITE_SOURCES` must fail here, not leave the site quietly stale.
 */
const viewerFiles = (): string[] => {
	const seen = new Set<string>();
	const stack = readdirSync(join(workspace, 'src/viewer')).map((f) => join(workspace, 'src/viewer', f));
	while (stack.length > 0) {
		const file = stack.pop() as string;
		if (seen.has(file) || !/\.(tsx?|css)$/.test(file)) continue;
		seen.add(file);
		for (const [, spec] of readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]((?:\.|@\/)[^'"]+)['"]/g)) {
			const path = spec?.startsWith('@/') ? join(workspace, 'src/renderer', spec.slice(2)) : join(dirname(file), spec as string);
			const found = [path, `${path}.ts`, `${path}.tsx`, join(path, 'index.ts')].find((p) => existsSync(p) && /\.(tsx?|css)$/.test(p));
			if (found) stack.push(found);
		}
	}
	return [...seen].map((f) => relative(repository, f));
};

describe('what the site is built from', () => {
	it('counts every file the viewer is built from, so a change to one marks the site behind', () => {
		const files = viewerFiles();
		expect(files.length).toBeGreaterThan(20);
		expect(files.filter((f) => !isSiteSource(f))).toEqual([]);
	});

	it('counts the generator and its workflow, and not the rest of the app', () => {
		expect(isSiteSource('workspace/src/site/buildSite.ts')).toBe(true);
		expect(isSiteSource('.github/workflows/publish-prototypes.yml')).toBe(true);
		expect(isSiteSource('workspace/src/main/services/agent.ts')).toBe(false);
		expect(isSiteSource('projects/demo/brief.md')).toBe(false);
	});
});
