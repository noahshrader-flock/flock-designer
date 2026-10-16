import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { contrastRatio } from '../src/shared/tokens';
import { describe, expect, it } from 'vitest';
import { INK } from '../src/shared/pageInk';

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

	it('use amber only to say something needs a look: a change, a tried value, a mark is the brand, and a warning’s selectors are the only ones that take the warning colour', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		// The theme's "modified" colour is amber in most themes: it is how VS Code says a file changed, never how this does.
		expect(css).not.toMatch(/gitDecoration/);
		const rules = css.split('}').map((b) => b.split('{').map((x) => x.trim()));
		const amber = rules.filter(([, body]) => /editorWarning-foreground/.test(body ?? '')).map(([selector]) => selector);
		expect(amber).toEqual(['.badge-warning', '.note-warning .codicon', '.token-contrast-low,\n.warning-text']);
		// A change's mark is the brand.
		const mark = rules.find(([selector]) => selector?.startsWith('.token-changed'));
		expect(mark?.[1]).toMatch(/background:\s*var\(--dsnr-brand\)/);
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

	it('round a thumbnail by its own radius: a row’s, a card’s by a larger one, neither the smallest', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const radius = (selector: string) => /border-radius:\s*([^;]+);/.exec(css.split('}').find((b) => b.trim().startsWith(selector)) ?? '')?.[1];
		expect(radius('.picture')).toBe('var(--dsnr-radius-thumb)');
		expect(radius('.card-picture')).toBe('var(--dsnr-radius-thumb-card)');
		const size = (name: string) => Number(new RegExp(`--dsnr-radius-${name}:\\s*(\\d+)px`).exec(css)?.[1]);
		expect(size('thumb')).toBeGreaterThan(size('small'));
		expect(size('thumb-card')).toBeGreaterThan(size('thumb'));
	});

	it('wash a pressed thumbnail with the brand, lightly, not the list’s grey: shown on hover and focus, and over the picture only', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = (selector: string) => css.split('}').find((block) => block.trim().startsWith(selector)) ?? '';
		const wash = rule('.thumb-wash');
		// The brand at 25%, out of the way until asked for, and nothing else: no icon, no text.
		expect(wash).toMatch(/background:\s*color-mix\(in srgb,\s*var\(--dsnr-brand\)\s*25%,\s*transparent\)/);
		expect(wash).toMatch(/opacity:\s*0/);
		expect(rule('.row-button:hover .thumb-wash')).toMatch(/opacity:\s*1/);
		expect(css).toMatch(/\.row-button:focus-visible \.thumb-wash/);
		// What has a picture to wash does not also turn the whole row or card grey.
		expect(rule('.row-button:has(.thumb-wash):hover')).toMatch(/background:\s*transparent/);
		// Its corners are its picture's.
		expect(rule('.card-media .thumb-wash')).toMatch(/border-radius:\s*var\(--dsnr-radius-thumb-card\)/);
		expect(rule('.thumb .thumb-wash')).toMatch(/border-radius:\s*var\(--dsnr-radius-thumb\)/);
	});

	it('stretch a dialog’s buttons across its width, one or several alike', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		expect(rule('.dialog-buttons {')).toMatch(/display:\s*flex/);
		expect(rule('.dialog-buttons {')).not.toMatch(/justify-content/);
		expect(rule('.dialog-buttons .button')).toMatch(/flex:\s*1/);
		// A button is otherwise capped at a welcome view's 300px, short of a dialog's width.
		expect(rule('.dialog-buttons .button')).toMatch(/max-width:\s*none/);
	});

	it('draw a color as a circle, wherever it is drawn: one rule, and the large one only sets its size', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		expect(rule('.swatch {')).toMatch(/border-radius:\s*50%/);
		expect(rule('.swatch-large {')).not.toMatch(/border-radius/);
		// No other rule rounds a swatch to anything but a circle.
		const rounded = css
			.split('}')
			.filter((block) => /\.swatch[^{]*\{/.test(block))
			.flatMap((block) => [...block.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1]));
		expect(rounded.filter((value) => value !== '50%')).toEqual([]);
	});

	it('draw every outline and line in the panel in one border colour, the search box’s, from one name', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		// The theme's input border, then its widget border, then the contrast border: written once.
		expect(css).toMatch(/--dsnr-border:\s*var\(--vscode-input-border,\s*var\(--vscode-widget-border,\s*var\(--dsnr-contrast-border\)\)\);/);
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		expect(rule('.input {')).toMatch(/border:\s*1px solid var\(--dsnr-border\)/);
		for (const selector of [
			'.picture {',
			'.card-picture {',
			'.swatch {',
			'.stories {',
			'.aside-section {',
			'.issue {',
			'.chip {',
			'.primitive {',
			'.color-picker {',
			'.changed {',
		])
			expect(rule(selector), selector).toMatch(/border[a-z-]*:\s*1px solid var\(--dsnr-border\)/);
		// Nothing else names the theme's input or widget border: a line that did would be a second colour for the same thing.
		// (A floating widget has its own: a dialog's, a menu's, a dropdown's. A drawn corner is an illustration, with its own fallback.)
		const named = css
			.split('\n')
			.filter((l) => /--vscode-(input|widget)-border/.test(l) && !l.includes('--dsnr-border:') && !l.includes('var(--vscode-foreground)'));
		expect(named).toEqual([]);
	});

	it('inset the design system’s tokens from the panel’s right edge as from its left, as the cards are', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const body = css.split('}').find((b) => b.trim().startsWith('.token-body')) ?? '';
		expect(body).toMatch(/padding:\s*0 12px 4px 28px;/);
		// 12px is the grid's own inset on the right.
		expect(css.split('}').find((b) => b.trim().startsWith('.grid {'))).toMatch(/padding:\s*4px 12px 8px;/);
	});

	it('lay a dialog’s title and its close X in one row, the X at the far right', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const head = css.split('}').find((b) => b.trim().startsWith('.dialog-head')) ?? '';
		expect(head).toMatch(/display:\s*flex/);
		expect(head).toMatch(/justify-content:\s*space-between/);
		expect(head).toMatch(/align-items:\s*center/);
	});

	it('size a picture to the box it is in, border and all, so what is laid over it covers it exactly', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = (selector: string) => css.split('}').find((block) => block.trim().startsWith(selector)) ?? '';
		// `width: 100%` with a border is two pixels wider than its box otherwise: a sliver the wash does not reach.
		expect(rule('.card-picture')).toMatch(/box-sizing:\s*border-box/);
		expect(rule('.picture {')).toMatch(/box-sizing:\s*border-box/);
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
		// Its wash is made from it, so agreeing here is agreeing for both.
		expect(INK.pin.toLowerCase()).toBe(brand);
	});

	it('pad the text under a card’s picture at its sides and bottom from one name, and sit it under the picture by the card’s own gap, for every card (projects and components alike)', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		expect(css).toMatch(/--dsnr-card-text-pad:\s*8px/);
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		// No padding above: the name sits close under its picture, by the card's gap alone.
		expect(rule('.card-text {')).toMatch(/padding:\s*0 var\(--dsnr-card-text-pad\) var\(--dsnr-card-text-pad\);/);
		expect(rule('.card {')).toMatch(/gap:\s*8px;/);
	});

	it('divide the design system’s sets from one another, in the semantic colors and in the palette alike, with one line that reads in any theme', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = css.split('}').find((b) => /\.theme-set \+ \.theme-set/.test(b)) ?? '';
		// One rule for both, so a set is never divided in one view and not in the other.
		expect(rule).toMatch(/\.token-set \+ \.token-set/);
		// The panel's one border colour, the search box's (`--dsnr-border`).
		expect(rule).toMatch(/border-top:\s*1px solid var\(--dsnr-border\)/);
	});

	it('draw every count bubble one size, from one name: a circle for a digit, wherever it sits (a row, a card, a header)', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		expect(css).toMatch(/--dsnr-badge:\s*17px/);
		const badge = css.split('}').find((b) => b.trim().startsWith('.badge {')) ?? '';
		// A box of its own wherever it is: a plain inline span ignores a height and a minimum width, which is how a card's
		// came out smaller than a row's.
		expect(badge).toMatch(/display:\s*inline-flex/);
		expect(badge).toMatch(/\sheight:\s*var\(--dsnr-badge\);/);
		expect(badge).toMatch(/min-width:\s*var\(--dsnr-badge\);/);
		expect(badge).toMatch(/border-radius:\s*calc\(var\(--dsnr-badge\) \/ 2\);/);
		expect(badge).toMatch(/box-sizing:\s*border-box/);
		// Little enough padding that one digit never makes it wider than it is tall.
		expect(badge).toMatch(/padding:\s*0 3px;/);
		// No other rule sizes a bubble, but the blank one: extra small, a circle, from its own name.
		expect(css).toMatch(/--dsnr-badge-xs:\s*9px/);
		const xs = css.split('}').find((b) => b.trim().startsWith('.badge-xs {')) ?? '';
		expect(xs).toMatch(/\sheight:\s*var\(--dsnr-badge-xs\);/);
		expect(xs).toMatch(/min-width:\s*var\(--dsnr-badge-xs\);/);
		expect(xs).toMatch(/border-radius:\s*50%;/);
		expect(css.match(/\.badge[^{]*\{[^}]*(?:min-width|\sheight):/g)).toHaveLength(2);
	});

	it('stretch a dialog’s buttons across its width, one or several alike', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		expect(rule('.dialog-buttons {')).toMatch(/display:\s*flex/);
		expect(rule('.dialog-buttons {')).not.toMatch(/justify-content/);
		expect(rule('.dialog-buttons .button')).toMatch(/flex:\s*1/);
		// A button is otherwise capped at a welcome view's 300px, short of a dialog's width.
		expect(rule('.dialog-buttons .button')).toMatch(/max-width:\s*none/);
	});

	it('lay a dialog’s title and its close X in one row, the X at the far right', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const head = css.split('}').find((b) => b.trim().startsWith('.dialog-head')) ?? '';
		expect(head).toMatch(/display:\s*flex/);
		expect(head).toMatch(/justify-content:\s*space-between/);
		expect(head).toMatch(/align-items:\s*center/);
	});

	it('hold a component page’s header fixed with its stories and its analysis scrolling apart when there is room for both, and the header sticky when there is not', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const wide = /@media \(min-width: 900px\) \{([\s\S]*?)\n\}/.exec(css.slice(css.indexOf('.tab-split')))?.[1] ?? '';
		const within = (selector: string) => new RegExp(`${selector.replace('.', '\\.')} \\{([^}]*)\\}`).exec(wide)?.[1] ?? '';
		// Room for two columns: the page is the window's height, and each pane scrolls inside it.
		expect(within('.tab-split')).toMatch(/height:\s*100vh/);
		expect(within('.tab-split')).toMatch(/overflow:\s*hidden/);
		expect(within('.component-layout')).toMatch(/flex:\s*1/);
		expect(within('.component-layout')).toMatch(/min-height:\s*0/);
		const panes = /\.component-stories,\s*\.tab-split \.component-aside \{([^}]*)\}/.exec(wide)?.[1] ?? '';
		expect(panes).toMatch(/overflow-y:\s*auto/);
		expect(panes).toMatch(/min-height:\s*0/);
		// Both end on one line: no room left under either inside its scroll, the page's own below both.
		expect(panes).not.toMatch(/padding-bottom/);
		expect(within('.tab-split')).toMatch(/padding-bottom:\s*16px/);
		// The stories' box fills its pane, and its page scrolls inside it, so its bottom is the analysis's bottom.
		expect(within('.stories')).toMatch(/flex:\s*1/);
		expect(within('.stories')).toMatch(/min-height:\s*0/);
		expect(within('.story-frame')).toMatch(/height:\s*100%/);
		// Anywhere else a frame is as tall as its page says.
		expect(css.split('}').find((b) => b.trim().startsWith('.story-frame {'))).toMatch(/height:\s*var\(--frame-height\)/);
		// Without it, the page scrolls as a whole and the header stays at the top of it.
		const header = css.split('}').find((b) => b.trim().startsWith('.tab-split .tab-header')) ?? '';
		expect(header).toMatch(/position:\s*sticky/);
		expect(header).toMatch(/top:\s*0/);
	});

	it('draw a row’s thumbnail 56px wide, in the shape of a card’s picture', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		const picture = css.split('}').find((b) => b.trim().startsWith('.picture {')) ?? '';
		expect(picture).toMatch(/width:\s*56px;/);
		expect(picture).toMatch(/aspect-ratio:\s*16 \/ 9;/);
	});

	it('space a grid’s cards by one named gap, across and down alike', () => {
		const css = files()
			.find((f) => f.path.endsWith('styles.css'))!
			.text.replace(/\/\*[\s\S]*?\*\//g, '');
		expect(css).toMatch(/--dsnr-grid-gap:\s*8px/);
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
		expect(rule('.input {')).toMatch(/height:\s*var\(--dsnr-control\)/);
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
