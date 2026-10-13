import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DSNR is drawn in VS Code's own design language (ELECTRON_MIGRATION_PLAN, §1.4, decision 6): none of the app's shadcn
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

	it('keep a card’s ellipsis button opaque on hover: it is over a picture, and the toolbar’s hover colour is see-through', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = (selector: string) => css.split('}').find((block) => block.trim().startsWith(selector)) ?? '';
		// The tint is a layer over the widget's own colour, which is solid; a plain tint would let the picture through.
		expect(rule('.card-item .menu-button:hover')).toMatch(
			/background:\s*linear-gradient\(var\(--vscode-toolbar-hoverBackground\),\s*var\(--vscode-toolbar-hoverBackground\)\),\s*var\(--vscode-editorWidget-background\)/,
		);
	});

	it('round a project’s thumbnails: a row’s by the panel’s radius, a card’s by a larger one, never the smallest', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const radius = (selector: string) => /border-radius:\s*([^;]+);/.exec(css.split('}').find((b) => b.trim().startsWith(selector)) ?? '')?.[1];
		expect(radius('.picture')).toBe('var(--dsnr-radius)');
		expect(radius('.card-picture')).toBe('var(--dsnr-radius-large)');
	});
});
