import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { contrastRatio } from '../src/shared/tokens';
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

	it('write one colour of their own, DSNR’s brand: every other is one of VS Code’s theme variables, and high contrast gives way to the theme’s button', () => {
		const colour = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/;
		const said = files()
			.filter(({ path }) => /\.(tsx|css)$/.test(path))
			.flatMap(({ path, text }) =>
				text
					.split('\n')
					.filter((line) => colour.test(line))
					.map((line) => `${path.split('/').at(-1)}: ${line.trim()}`),
			);
		expect(said).toEqual(['styles.css: --dsnr-brand: #7c3aed;', 'styles.css: --dsnr-on-brand: #ffffff;']);
		// The words on the brand are readable: WCAG AA's 4.5:1 for text, on the fill and on its darker hover.
		const css0 = files().find((f) => f.path.endsWith('styles.css'))!.text;
		const brand = /--dsnr-brand:\s*(#[0-9a-f]{6})/i.exec(css0)![1]!;
		const hover = /--dsnr-brand-hover:\s*color-mix\(in srgb,\s*var\(--dsnr-brand\)\s*(\d+)%,\s*black\)/.exec(css0);
		expect(contrastRatio('#ffffff', brand)).toBeGreaterThanOrEqual(4.5);
		// Hover is the brand mixed toward black, so it is only darker, and white on it only more readable.
		expect(hover).not.toBeNull();
		const css = files().find((f) => f.path.endsWith('styles.css'))!.text;
		const highContrast = css.split('}').find((b) => b.includes('body.vscode-high-contrast')) ?? '';
		expect(highContrast).toMatch(/--dsnr-brand:\s*var\(--vscode-button-background\)/);
		expect(highContrast).toMatch(/--dsnr-on-brand:\s*var\(--vscode-button-foreground\)/);
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

	it('show a view’s own menu button always, after the rule that hides a row’s until it is hovered, so it wins', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const hidden = css.search(/\.menu-button\s*\{\s*opacity:\s*0/);
		const shown = css.search(/\.menu-button-shown\s*\{\s*opacity:\s*1/);
		expect(hidden).toBeGreaterThan(-1);
		expect(shown).toBeGreaterThan(hidden);
	});

	it('size every control from two tokens: the default (the search, the toggle, a button, an icon button) and the small (a row’s, a header’s)', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const token = (name: string) => new RegExp(`--dsnr-${name}:\\s*(\\d+)px`).exec(css)?.[1];
		expect(token('control')).toBe('32');
		expect(token('control-small')).toBe('22');
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		// Each takes its size from the token, never a number of its own.
		expect(rule('.search .search-input')).toMatch(/height:\s*var\(--dsnr-control\)/);
		expect(rule('.button {')).toMatch(/min-height:\s*var\(--dsnr-control\)/);
		expect(rule('.icon-button,')).toMatch(/width:\s*var\(--dsnr-control\)[\s\S]*height:\s*var\(--dsnr-control\)/);
		expect(rule('.toggle-option')).toMatch(/height:\s*calc\(var\(--dsnr-control\)/);
		expect(rule('.icon-button-small,')).toMatch(/width:\s*var\(--dsnr-control-small\)[\s\S]*height:\s*var\(--dsnr-control-small\)/);
	});

	it('hide a row’s badge only when the ellipsis button takes its place, not whenever the row has focus', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const selectors = css
			.split('}')
			.filter((b) => /visibility:\s*hidden/.test(b) && b.includes('.badge'))
			.map((b) => b.split('{')[0]!.trim());
		expect(selectors.join(' ')).not.toMatch(/\.row-item:focus-within/);
		expect(selectors.join(' ')).toMatch(/:has\(\.item-actions:focus-within\)/);
	});
});
