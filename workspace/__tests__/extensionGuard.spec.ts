import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DSGN is drawn in VS Code's own design language (ELECTRON_MIGRATION_PLAN, §1.4, decision 6): none of the app's shadcn
 * components or Tailwind, and no colour of its own, only VS Code's theme variables, so it follows every theme, high
 * contrast included.
 */

const root = join(__dirname, '../extension');
const sources = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (name === 'dist' || name === 'node_modules' || name.startsWith('.')) return [];
		return statSync(path).isDirectory() ? sources(path) : /\.(tsx?|css|mjs)$/.test(name) ? [path] : [];
	});
const files = () => sources(root).map((path) => ({ path: relative(root, path), text: readFileSync(path, 'utf8') }));

describe('the extension’s sources', () => {
	it('are there to check', () => {
		expect(files().length).toBeGreaterThan(0);
	});

	it('import none of the app’s shadcn components, their parts, or Tailwind', () => {
		const forbidden =
			/from ['"](?:[./]*src\/renderer\/ui\/|@\/|radix-ui|lucide-react|class-variance-authority|tailwind-merge|tailwindcss|@tailwindcss\/)|@import ['"]tailwindcss/;
		expect(
			files()
				.filter(({ text }) => forbidden.test(text))
				.map((f) => f.path),
		).toEqual([]);
	});

	it('write no colour of their own: every colour is one of VS Code’s theme variables', () => {
		const colour = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/;
		const said = files()
			.filter(({ path }) => /\.(tsx|css)$/.test(path))
			.flatMap(({ path, text }) =>
				text
					.split('\n')
					.filter((line) => colour.test(line))
					.map((line) => `${path}: ${line.trim()}`),
			);
		expect(said).toEqual([]);
	});
});
