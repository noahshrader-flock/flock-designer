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

	it('draw the pins on a prototype’s page in the brand’s purple: the page cannot read the theme, so its palette says it again, and agrees', () => {
		const css = files().find((f) => f.path.endsWith('styles.css'))!.text;
		const brand = /--dsnr-brand:\s*(#[0-9a-f]{6})/i.exec(css)![1]!.toLowerCase();
		// Read as text: the page's code needs a browser window to load.
		const palette = readFileSync(join(__dirname, '../src/page/helpers.ts'), 'utf8');
		expect(/pin:\s*'(#[0-9a-f]{6})'/i.exec(palette)?.[1]?.toLowerCase()).toBe(brand);
		// Its wash is the same colour at 8%.
		const [r, g, b] = [1, 3, 5].map((i) => parseInt(brand.slice(i, i + 2), 16));
		expect(/pinWash:\s*'([^']+)'/.exec(palette)?.[1]).toBe(`rgba(${r},${g},${b},.08)`);
	});

	it('pad the text under a card’s picture on all four sides, from one name, for every card (projects and components alike)', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		expect(css).toMatch(/--dsnr-card-text-pad:\s*8px/);
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		expect(rule('.card-text')).toMatch(/padding:\s*var\(--dsnr-card-text-pad\);/);
	});

	it('space a grid’s cards by one named gap, across and down alike', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		expect(css).toMatch(/--dsnr-grid-gap:\s*16px/);
		const grid = css.split('}').find((b) => b.trim().startsWith('.grid {')) ?? '';
		// One value for both directions: `gap` alone, never a row and a column of their own.
		expect(grid).toMatch(/\sgap:\s*var\(--dsnr-grid-gap\);/);
		expect(grid).not.toMatch(/row-gap|column-gap/);
	});

	it('lay a design system’s header out in two lines: its name, with Sync and its menu centred on that line, and its branch under the name', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		expect(rule('.ds-header')).toMatch(/display:\s*grid/);
		expect(rule('.ds-title')).toMatch(/display:\s*contents/);
		expect(rule('.ds-name')).toMatch(/grid-row:\s*1/);
		expect(rule('.ds-actions {')).toMatch(/grid-row:\s*1/);
		expect(rule('.ds-branch')).toMatch(/grid-row:\s*2/);
		// Its icon is the extra small size, a name for it, set over the icon font's own size.
		expect(css).toMatch(/--dsnr-icon-xs:\s*12px/);
		expect(rule('.codicon.icon-xs')).toMatch(/font-size:\s*var\(--dsnr-icon-xs\)/);
	});

	it('layer what is above what by names: the bars kept at the top above a row’s actions a list scrolls under, a dialog above all', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const layer = (name: string) => Number(new RegExp(`--dsnr-layer-${name}:\\s*(\\d+)`).exec(css)?.[1]);
		expect(layer('actions')).toBeLessThan(layer('top'));
		expect(layer('top')).toBeLessThan(layer('dialog'));
		// No layer is a number of its own: each rule says which, by name.
		expect([...css.matchAll(/z-index:\s*([^;]+);/g)].map((m) => m[1]).filter((v) => !v!.startsWith('var(--dsnr-layer-'))).toEqual([]);
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		// The bars share one rule: sticky, above the actions, with the sidebar behind them.
		const bars = css.split('}').find((b) => b.includes('.panel-top,') && b.includes('.ds-part,') && b.includes('.tab-body .view-bar')) ?? '';
		expect(bars).toMatch(/position:\s*sticky/);
		expect(bars).toMatch(/z-index:\s*var\(--dsnr-layer-top\)/);
		expect(bars).toMatch(/background:\s*var\(--vscode-sideBar-background\)/);
		expect(rule('.item-actions {')).toMatch(/z-index:\s*var\(--dsnr-layer-actions\)/);
		// The tab's bar is kept under the toggle's: its top is the toggle's bar's height.
		expect(rule('.tab-body .view-bar')).toMatch(/top:\s*var\(--dsnr-top-height\)/);
	});

	it('keep the design system’s Components and Tokens toggle at the top too, with the search bar stacked under it', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		expect(rule('.ds-part {')).toMatch(/top:\s*var\(--dsnr-top-height\)/);
		// Its height is its own padding and the control's, named, so the bar under it starts where it ends.
		expect(css).toMatch(/--dsnr-part-height:\s*calc\(var\(--dsnr-control\)\s*\+\s*var\(--dsnr-part-pad-top\)\s*\+\s*var\(--dsnr-part-pad-bottom\)\)/);
		expect(rule('.ds-part {')).toMatch(/padding:\s*var\(--dsnr-part-pad-top\)[^;]*var\(--dsnr-part-pad-bottom\)/);
		expect(rule('.tab-body .ds-part ~ .view-bar')).toMatch(/top:\s*calc\(var\(--dsnr-top-height\)\s*\+\s*var\(--dsnr-part-height\)\)/);
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
