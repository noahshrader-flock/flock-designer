import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { contrastRatio } from '../src/shared/tokens';
import { describe, expect, it } from 'vitest';
import { INK } from '../src/shared/pageInk';
import { BRAND, ON_BRAND } from '../src/shared/brand';
import { panelCss } from './panelStyles';

const root = join(__dirname, '..');
const sources = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (name === 'dist' || name === 'node_modules' || name.startsWith('.')) return [];
		return statSync(path).isDirectory() ? sources(path) : /\.(tsx?|css|mjs)$/.test(name) ? [path] : [];
	});
const files = () =>
	[join(root, 'extension'), join(root, 'src/ui'), join(root, 'src/viewer')]
		.flatMap(sources)
		.map((path) => ({ path: relative(root, path), text: readFileSync(path, 'utf8') }));

describe('the extension’s sources', () => {
	it('are there to check', () => {
		expect(files().length).toBeGreaterThan(0);
	});

	it('import none of shadcn’s components, Radix, lucide’s icons or Tailwind: one kit, DSNR’s own', () => {
		const forbidden =
			/from ['"](?:@\/|radix-ui|@radix-ui\/|lucide-react|class-variance-authority|tailwind-merge|clsx|tailwindcss|@tailwindcss\/)|@import ['"]tailwindcss/;
		expect(
			files()
				.filter(({ text }) => forbidden.test(text))
				.map((f) => f.path),
		).toEqual([]);
	});

	it('use amber only to say something needs a look: a change, a tried value, a mark is the brand, and a warning’s selectors are the only ones that take the warning colour', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		// The theme's "modified" colour is amber in most themes: it is how VS Code says a file changed, never how this does.
		expect(css).not.toMatch(/gitDecoration/);
		const rules = css.split('}').map((b) => b.split('{').map((x) => x.trim()));
		const amber = rules.filter(([, body]) => /editorWarning-foreground/.test(body ?? '')).map(([selector]) => selector);
		expect(amber.sort()).toEqual(['.badge-warning', '.message-warning .codicon', '.warning-text']);
		const mark = rules.find(([selector]) => selector?.startsWith('.changed-mark'));
		expect(mark?.[1]).toMatch(/background:\s*var\(--dsnr-brand\)/);
	});

	it('write no colour of their own: the brand is written once (`shared/brand.ts`) and set on each page, every other is VS Code’s theme, and high contrast gives way to the theme’s button', () => {
		const colour = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/;
		// VS Code's own theme, written once for where VS Code gives none (below), is not a colour of DSNR's.
		const said = files()
			.filter(({ path }) => /\.(tsx|css)$/.test(path) && !path.endsWith('ui/theme.css'))
			.flatMap(({ path, text }) =>
				text
					.split('\n')
					.filter((line) => colour.test(line))
					.map((line) => `${path.split('/').at(-1)}: ${line.trim()}`),
			);
		expect(said).toEqual([]);
		const everywhere = ['src', 'extension']
			.flatMap((dir) => sources(join(root, dir)))
			.filter((path) => readFileSync(path, 'utf8').toLowerCase().includes(BRAND.toLowerCase()));
		expect(everywhere.map((path) => relative(root, path))).toEqual(['src/shared/brand.ts']);
		for (const entry of ['extension/webview/main.tsx', 'src/viewer/main.tsx'])
			expect(readFileSync(join(root, entry), 'utf8')).toMatch(/applyBrand\(document\)/);
		const css0 = panelCss();
		const hover = /--dsnr-brand-hover:\s*color-mix\(in srgb,\s*var\(--dsnr-brand\)\s*(\d+)%,\s*black\)/.exec(css0);
		expect(contrastRatio(ON_BRAND, BRAND)).toBeGreaterThanOrEqual(4.5);
		// Hover is the brand mixed toward black, so it is only darker, and white on it only more readable.
		expect(hover).not.toBeNull();
		const css = panelCss();
		const highContrast = css.split('}').find((b) => b.includes('body.vscode-high-contrast')) ?? '';
		expect(highContrast).toMatch(/--dsnr-brand:\s*var\(--vscode-button-background\)/);
		expect(highContrast).toMatch(/--dsnr-on-brand:\s*var\(--vscode-button-foreground\)/);
	});

	it('keep a card’s ellipsis button opaque on hover: it is over a picture, and the toolbar’s hover colour is see-through', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = (selector: string) => css.split('}').find((block) => block.trim().startsWith(selector)) ?? '';
		// The tint is a layer over the widget's own colour, which is solid; a plain tint would let the picture through.
		expect(rule('.card-item .menu-button:hover')).toMatch(
			/background:\s*linear-gradient\(var\(--vscode-toolbar-hoverBackground\),\s*var\(--vscode-toolbar-hoverBackground\)\),\s*var\(--vscode-editorWidget-background\)/,
		);
	});

	it('round a thumbnail by its own radius: a row’s, a card’s by a larger one, neither the smallest', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const radius = (selector: string) => /border-radius:\s*([^;]+);/.exec(css.split('}').find((b) => b.trim().startsWith(selector)) ?? '')?.[1];
		expect(radius('.picture')).toBe('var(--dsnr-radius-thumb)');
		expect(radius('.card-picture')).toBe('var(--dsnr-radius-thumb-card)');
		const size = (name: string) => Number(new RegExp(`--dsnr-radius-${name}:\\s*(\\d+)px`).exec(css)?.[1]);
		expect(size('thumb')).toBeGreaterThan(size('small'));
		expect(size('thumb-card')).toBeGreaterThan(size('thumb'));
	});

	it('wash a pressed thumbnail with the brand, lightly, not the list’s grey: shown on hover and focus, and over the picture only', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = (selector: string) => css.split('}').find((block) => block.trim().startsWith(selector)) ?? '';
		const wash = rule('.thumb-wash');
		expect(wash).toMatch(/background:\s*color-mix\(in srgb,\s*var\(--dsnr-brand\)\s*25%,\s*transparent\)/);
		expect(wash).toMatch(/opacity:\s*0/);
		expect(rule('.row-button:hover .thumb-wash')).toMatch(/opacity:\s*1/);
		expect(css).toMatch(/\.row-button:focus-visible \.thumb-wash/);
		// What has a picture to wash does not also turn the whole row or card grey: only one with none is.
		expect(rule('.row-button:not(:has(.thumb-wash)):hover')).toMatch(/background:\s*var\(--vscode-list-hoverBackground\)/);
		expect(css).not.toMatch(/\.row-button:hover\s*\{/);
		expect(rule('.card-media .thumb-wash')).toMatch(/border-radius:\s*var\(--dsnr-radius-thumb-card\)/);
		expect(rule('.thumb .thumb-wash')).toMatch(/border-radius:\s*var\(--dsnr-radius-thumb\)/);
	});

	it('stretch a dialog’s buttons across its width, one or several alike', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		expect(rule('.dialog-buttons {')).toMatch(/display:\s*flex/);
		expect(rule('.dialog-buttons {')).not.toMatch(/justify-content/);
		expect(rule('.dialog-buttons .button')).toMatch(/flex:\s*1/);
		// A button is otherwise capped at a welcome view's 300px, short of a dialog's width.
		expect(rule('.dialog-buttons .button')).toMatch(/max-width:\s*none/);
	});

	it('draw a color as a circle, wherever it is drawn: one rule, and the large one only sets its size', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		expect(rule('.swatch {')).toMatch(/border-radius:\s*50%/);
		expect(rule('.swatch-large {')).not.toMatch(/border-radius/);
		const rounded = css
			.split('}')
			.filter((block) => /\.swatch[^{]*\{/.test(block))
			.flatMap((block) => [...block.matchAll(/border-radius:\s*([^;]+);/g)].map((m) => m[1]));
		expect(rounded.filter((value) => value !== '50%')).toEqual([]);
	});

	it('give every theme name the kit reads a value where VS Code gives none, from VS Code’s own themes, light and dark', () => {
		const kit = files().filter(({ path }) => path.startsWith('src/ui/') && !path.endsWith('theme.css'));
		const read = new Set(kit.flatMap(({ text }) => [...text.matchAll(/var\((--vscode-[\w-]+)/g)].map((m) => m[1]!)));
		const theme = files().find(({ path }) => path.endsWith('ui/theme.css'))!.text;
		const block = (selector: string) => theme.slice(theme.indexOf(`${selector} {`), theme.indexOf('}', theme.indexOf(`${selector} {`)));
		const given = (selector: string) => new Set([...block(selector).matchAll(/(--vscode-[\w-]+):/g)].map((m) => m[1]!));
		// High contrast's own are set by VS Code only in a high contrast theme, and the kit draws nothing where they are not.
		const ownedByHighContrast = new Set(['--vscode-contrastBorder', '--vscode-contrastActiveBorder']);
		const wanted = [...read].filter((name) => !ownedByHighContrast.has(name)).sort();
		expect(wanted.filter((name) => !given(':root').has(name))).toEqual([]);
		const colours = [...given(':root')].filter((name) => !/font/.test(name)).sort();
		expect([...given(':root.dark')].sort()).toEqual(colours);
		expect([...theme.matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]!).filter((name) => !name.startsWith('--vscode-'))).toEqual([]);
	});

	it('space everything by the one scale: no padding, margin or gap is a number of pixels of its own', () => {
		const viewer = files().find((f) => f.path.endsWith('viewer/viewer.css'))!.text;
		const css = `${panelCss()}\n${viewer}`.replace(/\/\*[\s\S]*?\*\//g, '');
		// Outside the variables, where the scale and the sizes made from it are written.
		const rules = css.slice(css.indexOf('}', css.indexOf(':root')) + 1);
		const spacing = [...rules.matchAll(/^\s*((?:padding|margin|gap|row-gap|column-gap)[a-z-]*):\s*([^;]+);/gm)];
		expect(spacing.length).toBeGreaterThan(100);
		expect(spacing.filter(([, , value]) => /\d+px/.test(value!)).map(([line]) => line.trim())).toEqual([]);
	});

	it('draw the keyboard’s focus as one ring, from one rule, with one offset', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const rings = css.split('}').filter((b) => /outline:\s*var\(--dsnr-focus\)/.test(b));
		// Every control's, and a field's, which is drawn however the focus came to it.
		expect(rings.map((b) => b.split('{')[0]!.trim())).toEqual([':focus-visible', '.input:focus']);
		expect(rings.every((b) => /outline-offset:\s*var\(--dsnr-focus-offset\)/.test(b))).toBe(true);
		expect(css.match(/outline-offset:\s*[^;]+;/g)).toEqual(Array(2).fill('outline-offset: var(--dsnr-focus-offset);'));
	});

	it('draw every outline and line in the panel in one border colour, the search box’s, from one name', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
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
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const body = css.split('}').find((b) => b.trim().startsWith('.token-body')) ?? '';
		expect(body).toMatch(/padding:\s*0 var\(--dsnr-space-5\) var\(--dsnr-space-2\) var\(--dsnr-indent\);/);
		expect(css.split('}').find((b) => b.trim().startsWith('.grid {'))).toMatch(
			/padding:\s*var\(--dsnr-space-2\) var\(--dsnr-space-5\) var\(--dsnr-space-4\);/,
		);
	});

	it('lay a dialog’s title and its close X in one row, the X at the far right', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const head = css.split('}').find((b) => b.trim().startsWith('.dialog-head')) ?? '';
		expect(head).toMatch(/display:\s*flex/);
		expect(head).toMatch(/justify-content:\s*space-between/);
		expect(head).toMatch(/align-items:\s*center/);
	});

	it('size a picture to the box it is in, border and all, so what is laid over it covers it exactly', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = (selector: string) => css.split('}').find((block) => block.trim().startsWith(selector)) ?? '';
		// `width: 100%` with a border is two pixels wider than its box otherwise: a sliver the wash does not reach.
		expect(rule('.card-picture')).toMatch(/box-sizing:\s*border-box/);
		expect(rule('.picture {')).toMatch(/box-sizing:\s*border-box/);
	});

	it('show a view’s own menu button always, after the rule that hides a row’s until it is hovered, so it wins', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const hidden = css.search(/\.menu-button\s*\{\s*opacity:\s*0/);
		const shown = css.search(/\.menu-button-shown\s*\{\s*opacity:\s*1/);
		expect(hidden).toBeGreaterThan(-1);
		expect(shown).toBeGreaterThan(hidden);
	});

	it('draw the pins on a prototype’s page in the brand: the page cannot read the theme, so its palette takes it from where it is written', () => {
		expect(INK.pin).toBe(BRAND);
	});

	it('pad the text under a card’s picture at its sides and bottom from one name, and sit it under the picture by the card’s own gap, for every card (projects and components alike)', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		expect(css).toMatch(/--dsnr-card-text-pad:\s*var\(--dsnr-space-4\)/);
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		expect(rule('.card-text {')).toMatch(/padding:\s*0 var\(--dsnr-card-text-pad\) var\(--dsnr-card-text-pad\);/);
		expect(rule('.card {')).toMatch(/gap:\s*var\(--dsnr-space-4\);/);
	});

	it('divide the design system’s sets from one another, in the semantic colors and in the palette alike, with one line that reads in any theme', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = css.split('}').find((b) => /\.theme-set \+ \.theme-set/.test(b)) ?? '';
		// One rule for both, so a set is never divided in one view and not in the other.
		expect(rule).toMatch(/\.token-set \+ \.token-set/);
		expect(rule).toMatch(/border-top:\s*1px solid var\(--dsnr-border\)/);
	});

	it('draw every count bubble one size, from one name: a circle for a digit, wherever it sits (a row, a card, a header)', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
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
		expect(badge).toMatch(/padding:\s*0 var\(--dsnr-space-2\);/);
		expect(css).toMatch(/--dsnr-badge-xs:\s*9px/);
		const xs = css.split('}').find((b) => b.trim().startsWith('.badge-xs {')) ?? '';
		expect(xs).toMatch(/\sheight:\s*var\(--dsnr-badge-xs\);/);
		expect(xs).toMatch(/min-width:\s*var\(--dsnr-badge-xs\);/);
		expect(xs).toMatch(/border-radius:\s*50%;/);
		expect(css.match(/\.badge[^{]*\{[^}]*(?:min-width|\sheight):/g)).toHaveLength(2);
	});

	it('stretch a dialog’s buttons across its width, one or several alike', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		expect(rule('.dialog-buttons {')).toMatch(/display:\s*flex/);
		expect(rule('.dialog-buttons {')).not.toMatch(/justify-content/);
		expect(rule('.dialog-buttons .button')).toMatch(/flex:\s*1/);
		// A button is otherwise capped at a welcome view's 300px, short of a dialog's width.
		expect(rule('.dialog-buttons .button')).toMatch(/max-width:\s*none/);
	});

	it('lay a dialog’s title and its close X in one row, the X at the far right', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const head = css.split('}').find((b) => b.trim().startsWith('.dialog-head')) ?? '';
		expect(head).toMatch(/display:\s*flex/);
		expect(head).toMatch(/justify-content:\s*space-between/);
		expect(head).toMatch(/align-items:\s*center/);
	});

	it('hold a component page’s header fixed with its stories and its analysis scrolling apart when there is room for both, and the header sticky when there is not', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const wide = /@media \(min-width: 900px\) \{([\s\S]*?)\n\}/.exec(css.slice(css.indexOf('.tab-split')))?.[1] ?? '';
		const within = (selector: string) => new RegExp(`${selector.replace('.', '\\.')} \\{([^}]*)\\}`).exec(wide)?.[1] ?? '';
		expect(within('.tab-split')).toMatch(/height:\s*100vh/);
		expect(within('.tab-split')).toMatch(/overflow:\s*hidden/);
		expect(within('.component-layout')).toMatch(/flex:\s*1/);
		expect(within('.component-layout')).toMatch(/min-height:\s*0/);
		const panes = /\.component-stories,\s*\.tab-split \.component-aside \{([^}]*)\}/.exec(wide)?.[1] ?? '';
		expect(panes).toMatch(/overflow-y:\s*auto/);
		expect(panes).toMatch(/min-height:\s*0/);
		expect(panes).not.toMatch(/padding-bottom/);
		expect(within('.tab-split')).toMatch(/padding-bottom:\s*var\(--dsnr-space-6\)/);
		expect(within('.stories')).toMatch(/flex:\s*1/);
		expect(within('.stories')).toMatch(/min-height:\s*0/);
		expect(within('.story-frame')).toMatch(/height:\s*100%/);
		expect(css.split('}').find((b) => b.trim().startsWith('.story-frame {'))).toMatch(/height:\s*var\(--frame-height\)/);
		const header = css.split('}').find((b) => b.trim().startsWith('.tab-split .tab-header')) ?? '';
		expect(header).toMatch(/position:\s*sticky/);
		expect(header).toMatch(/top:\s*0/);
	});

	it('draw a row’s thumbnail 56px wide, in the shape of a card’s picture', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const picture = css.split('}').find((b) => b.trim().startsWith('.picture {')) ?? '';
		expect(picture).toMatch(/width:\s*56px;/);
		expect(picture).toMatch(/aspect-ratio:\s*16 \/ 9;/);
	});

	it('space a grid’s cards by one named gap, across and down alike', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		expect(css).toMatch(/--dsnr-grid-gap:\s*var\(--dsnr-space-4\)/);
		const grid = css.split('}').find((b) => b.trim().startsWith('.grid {')) ?? '';
		expect(grid).toMatch(/\sgap:\s*var\(--dsnr-grid-gap\);/);
		expect(grid).not.toMatch(/row-gap|column-gap/);
	});

	it('lay a design system’s header out in one line: its name, its branch’s icon directly after it, and its buttons at the right, a gap apart that is one named gap', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		expect(rule('.ds-header')).toMatch(/display:\s*grid/);
		expect(rule('.ds-title')).toMatch(/display:\s*flex/);
		expect(rule('.ds-name')).toMatch(/text-overflow:\s*ellipsis/);
		expect(rule('.ds-branch')).toMatch(/flex-shrink:\s*0/);
		expect(rule('.ds-branch')).not.toMatch(/grid-row/);
		expect(css).toMatch(/--dsnr-ds-gap:\s*var\(--dsnr-space-2\)/);
		for (const selector of ['.ds-header', '.ds-title', '.ds-actions {']) expect(rule(selector), selector).toMatch(/gap:\s*var\(--dsnr-ds-gap\)/);
		expect(css).toMatch(/--dsnr-icon-xs:\s*12px/);
		expect(rule('.codicon.icon-xs')).toMatch(/font-size:\s*var\(--dsnr-icon-xs\)/);
	});

	it('layer what is above what by names: the bars kept at the top above a row’s actions a list scrolls under, a dialog above them, a tooltip above all', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const layer = (name: string) => Number(new RegExp(`--dsnr-layer-${name}:\\s*(\\d+)`).exec(css)?.[1]);
		expect(layer('actions')).toBeLessThan(layer('top'));
		expect(layer('top')).toBeLessThan(layer('dialog'));
		expect(layer('dialog')).toBeLessThan(layer('tip'));
		expect([...css.matchAll(/z-index:\s*([^;]+);/g)].map((m) => m[1]).filter((v) => !v!.startsWith('var(--dsnr-layer-'))).toEqual([]);
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		const bars = css.split('}').find((b) => b.includes('.panel-top,') && b.includes('.ds-part,') && b.includes('.tab-body .view-bar')) ?? '';
		expect(bars).toMatch(/position:\s*sticky/);
		expect(bars).toMatch(/z-index:\s*var\(--dsnr-layer-top\)/);
		expect(bars).toMatch(/background:\s*var\(--vscode-sideBar-background\)/);
		expect(rule('.item-actions {')).toMatch(/z-index:\s*var\(--dsnr-layer-actions\)/);
		// The design system's row holds a menu, and a sticky row is a layer of its own: it is at the menu's, above the bars under it
		// (the toggle, the search bar), or its menu would open behind them.
		expect(rule('.ds-header {')).toMatch(/z-index:\s*var\(--dsnr-layer-menu\)/);
		expect(rule('.tab-body .view-bar')).toMatch(/top:\s*var\(--dsnr-top-height\)/);
	});

	it('list an accessibility issue’s elements as a plain list: one bullet and one size, the selector in the size of the words round it', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		// The browser's secondary bullet for a list inside a list is the circle: this one is the disc, as every list is.
		expect(rule('.issue-elements {')).toMatch(/list-style:\s*disc/);
		expect(rule('.issue-elements code')).toMatch(/font-size:\s*inherit/);
	});

	it('draw no outline round a popover or a dialog that takes the focus when it opens, from one rule', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = css.split('}').find((b) => b.includes('.popover:focus')) ?? '';
		expect(rule).toContain('.dialog:focus');
		expect(rule).toMatch(/outline:\s*none/);
		const sourceOf = (name: string) => files().find((f) => f.path.endsWith(name))!.text;
		expect(sourceOf('ui/Popover.tsx')).toContain('focusPanel(');
		expect(sourceOf('ui/Dialog.tsx')).toContain('focusPanel(');
		expect(sourceOf('ui/Popover.tsx')).not.toMatch(/\.focus\(/);
	});

	it('tell every page’s tooltips from one host, mounted in the page’s own root, which is the only thing that waits to tell them', () => {
		const main = files().find((f) => f.path.endsWith('webview/main.tsx'))!.text;
		expect(main).toMatch(/<TooltipHost \/>/);
		const delays = files().filter(({ path, text }) => /\.tsx?$/.test(path) && /TOOLTIP_DELAY_MS|delayDuration/.test(text));
		expect(delays.map((f) => f.path)).toEqual(['src/ui/Tooltip.tsx']);
	});

	it('keep the design system’s Components and Tokens toggle at the top too, with the search bar stacked under it', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		expect(rule('.ds-header')).toMatch(/top:\s*var\(--dsnr-top-height\)/);
		expect(css).toMatch(/--dsnr-ds-header-height:\s*calc\(var\(--dsnr-control-small\)\s*\+\s*2\s*\*\s*var\(--dsnr-ds-pad\)\)/);
		expect(rule('.ds-header')).toMatch(/padding:\s*var\(--dsnr-ds-pad\)/);
		expect(rule('.ds-header')).toMatch(/height:\s*var\(--dsnr-ds-header-height\)/);
		expect(rule('.ds-part {')).toMatch(/top:\s*calc\(var\(--dsnr-top-height\)\s*\+\s*var\(--dsnr-ds-header-height\)\)/);
		expect(css).toMatch(/--dsnr-part-height:\s*calc\(var\(--dsnr-control\)\s*\+\s*var\(--dsnr-part-pad-top\)\s*\+\s*var\(--dsnr-part-pad-bottom\)\)/);
		expect(rule('.ds-part {')).toMatch(/padding:\s*var\(--dsnr-part-pad-top\)[^;]*var\(--dsnr-part-pad-bottom\)/);
		expect(rule('.tab-body .ds-part ~ .view-bar')).toMatch(
			/top:\s*calc\(var\(--dsnr-top-height\)\s*\+\s*var\(--dsnr-ds-header-height\)\s*\+\s*var\(--dsnr-part-height\)\)/,
		);
	});

	it('size every control from two tokens: the default (the search, the toggle, a button, an icon button) and the small (a row’s, a header’s)', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const token = (name: string) => new RegExp(`--dsnr-${name}:\\s*(\\d+)px`).exec(css)?.[1];
		expect(token('control')).toBe('32');
		expect(token('control-small')).toBe('22');
		const rule = (selector: string) => css.split('}').find((b) => b.trim().startsWith(selector)) ?? '';
		expect(rule('.input {')).toMatch(/height:\s*var\(--dsnr-control\)/);
		expect(rule('.button {')).toMatch(/min-height:\s*var\(--dsnr-control\)/);
		expect(rule('.toggle-option')).toMatch(/height:\s*var\(--dsnr-toggle-option\)/);
		expect(css).toMatch(/--dsnr-toggle-option:\s*calc\(var\(--dsnr-control\)/);
		const square = rule('.icon-button,\n.menu-button,\n.button-icon,');
		expect(square).toMatch(/--square:\s*var\(--dsnr-control\)/);
		expect(square).toMatch(/width:\s*var\(--square\)[\s\S]*height:\s*var\(--square\)/);
		expect(square).toMatch(/box-sizing:\s*border-box/);
		expect(rule('.icon-button-small,')).toMatch(/--square:\s*var\(--dsnr-control-small\)/);
		expect(rule('.toggle-icons .toggle-option')).toMatch(/--square:\s*var\(--dsnr-toggle-option\)/);
		const own = css
			.split('}')
			.filter(
				(b) =>
					/^\s*\.(icon-button|menu-button|button-icon)[\w-]*\s*\{/m.test(b.split('{')[0]!.split(',').pop() ?? '') || /^\.toggle-icons/.test(b.trim()),
			)
			.filter((b) => !b.trim().startsWith('.icon-button,\n.menu-button,\n.button-icon,'))
			.filter((b) => /(^|[\s;])(width|height)\s*:/.test(b));
		expect(own.map((b) => b.split('{')[0]!.trim())).toEqual([]);
	});

	it('hide a row’s badge only when the ellipsis button takes its place, not whenever the row has focus', () => {
		const css = panelCss().replace(/\/\*[\s\S]*?\*\//g, '');
		const selectors = css
			.split('}')
			.filter((b) => /visibility:\s*hidden/.test(b) && b.includes('.badge'))
			.map((b) => b.split('{')[0]!.trim());
		expect(selectors.join(' ')).not.toMatch(/\.row-item:focus-within/);
		expect(selectors.join(' ')).toMatch(/:has\(\.item-actions:focus-within\)/);
	});
});
