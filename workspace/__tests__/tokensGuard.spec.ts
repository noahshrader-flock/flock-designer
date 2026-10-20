import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { BRAND, LINK_SHARE, ON_BRAND } from '../src/shared/dsnrTokens';
import { contrastRatio } from '../src/shared/tokens';
import { tokenProperties } from '../src/ui/applyTokens';
import { panelCss } from './panelStyles';
import { sourceFiles } from './fixtures';

const root = join(__dirname, '..');

// Where values are written: a token's definition, here, is the one place a raw value may be.
const HOMES = ['src/shared/dsnrTokens.ts', 'src/shared/pageTokens.ts', 'src/ui/theme.css'];

// Not DSNR's look: what reads a design system's files, whose colours and sizes are their data; the accessibility probe,
// whose values are WCAG's (text spacing) or a sentinel it reads back; and the extension test's world, a product's pages.
const NOT_LOOK =
	/^(src\/(core\/services\/designSystem|core\/services\/tokens|shared\/(tokens|tokenTags|cssVariables|objectLiteral|valueLocator|themeFiles)|page\/probe\.ts)|extension\/test\/)/;

const COLOUR =
	/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|(?<![-\w])(?:white|black|red|green|blue|gr[ae]y|orange|yellow|purple|pink)(?![-\w])/i;

const LOOK =
	/^(?:font(?:-size|-weight|-family)?|line-height|border-radius|(?:box|text)-shadow|opacity|transition|animation(?:-duration)?|(?:padding|margin)(?:-\w+)?|(?:row-|column-)?gap)$/;
const KEYWORDS = new Set(['var', 'calc', '0', 'inherit', 'none', 'normal', 'solid', 'ease', 'ease-in-out', 'linear', 'infinite', 'auto']);
// What is not a design choice: text the size of its parent's, a circle, a leading of exactly the text's size.
const ALLOWED: Record<string, string[]> = { 'font-size': ['1em', '100%'], 'border-radius': ['50%'], 'line-height': ['1'], opacity: ['1'] };

/** Is this part of a declaration's value a raw value: a length or time, a weight, a leading, an opacity, a font's name? */
const isRaw = (prop: string, part: string): boolean => {
	if (KEYWORDS.has(part) || part.startsWith('--') || ALLOWED[prop]?.includes(part)) return false;
	if (/^-?[\d.]+[a-z%]+$/.test(part)) return true;
	if (/^-?[\d.]+$/.test(part)) return ['font-weight', 'opacity', 'line-height'].includes(prop);
	return prop === 'font' || prop === 'font-family';
};

/** Raw values in CSS text, a custom property's (a token's definition) left out. */
const rawIn = (css: string): string[] =>
	css
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split(/[;{}]/)
		.flatMap((part) => {
			const [, prop = '', value = ''] = /^\s*([a-z][a-z-]*)\s*:\s*([\s\S]+?)\s*(?:!important)?\s*$/.exec(part) ?? [];
			const plain = value.replace(/var\(--[\w-]+(?:,[^)]*)?\)/g, 'var');
			const raw = COLOUR.test(plain) || (LOOK.test(prop) && plain.split(/[\s,/()*+]+/).some((p) => p !== '' && isRaw(prop, p)));
			return raw ? [`${prop}: ${value}`] : [];
		});

/** The text of each string and template in a script, what is put in its `${}` read as a token (`var`). */
const stringsOf = (path: string, text: string): string[] => {
	const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
	const found: string[] = [];
	const visit = (node: ts.Node) => {
		if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) found.push(node.text);
		else if (ts.isTemplateExpression(node)) found.push(node.head.text + node.templateSpans.map((span) => ` var ${span.literal.text}`).join(''));
		else if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
		else if (ts.isJsxAttribute(node) && node.name.getText() === 'style') {
			// React's `style={{ fontSize: 12 }}`, as the CSS it is: a number is pixels, anything not written there a token.
			const object = node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : undefined;
			if (object && ts.isObjectLiteralExpression(object))
				for (const p of object.properties)
					if (ts.isPropertyAssignment(p)) {
						const prop = p.name.getText().replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
						const value = ts.isNumericLiteral(p.initializer)
							? `${p.initializer.text}px`
							: ts.isStringLiteral(p.initializer)
								? p.initializer.text
								: 'var';
						found.push(`${prop}: ${value}`);
					}
		}
		ts.forEachChild(node, visit);
	};
	visit(file);
	return found;
};

const offences = () =>
	['src', 'extension']
		.flatMap((dir) => sourceFiles(join(root, dir)))
		.map((path) => ({ path: relative(root, path), text: readFileSync(path, 'utf8') }))
		.filter(({ path }) => !HOMES.includes(path) && !NOT_LOOK.test(path))
		.flatMap(({ path, text }) => {
			if (path.endsWith('.css')) return rawIn(text).map((said) => `${path}: ${said}`);
			return stringsOf(path, text).flatMap((said) => (/^\s*#[0-9a-f]{3,8}\s*$/i.test(said) ? [said] : rawIn(said)).map((raw) => `${path}: ${raw}`));
		});

describe('DSNR’s look', () => {
	it('is drawn only with tokens: no colour, type, radius, shadow, opacity, timing or spacing written outside their homes', () => {
		expect(offences()).toEqual([]);
	});
});

describe('the base tokens', () => {
	it('are written once, in `shared/dsnrTokens.ts` (a stylesheet may only point one at the theme), and set on each page drawn with the kit as it starts', () => {
		const sheets = ['src/ui/kit.css', 'extension/webview/styles.css', 'src/viewer/viewer.css'].map((file) => readFileSync(join(root, file), 'utf8'));
		const written = Object.keys(tokenProperties()).filter((name) => sheets.some((css) => new RegExp(`^\\s*${name}:(?!\\s*var\\()`, 'm').test(css)));
		expect(written).toEqual([]);
		for (const entry of ['extension/webview/main.tsx', 'src/viewer/main.tsx'])
			expect(readFileSync(join(root, entry), 'utf8')).toMatch(/applyTokens\(document\)/);
	});

	it('keep what is written on the brand readable, and give way to the theme’s button in high contrast', () => {
		expect(contrastRatio(ON_BRAND, BRAND)).toBeGreaterThanOrEqual(4.5);
		const css = panelCss();
		// Hover is the brand mixed toward black, so it is only darker, and white on it only more readable.
		expect(css).toMatch(/--dsnr-brand-hover:\s*color-mix\(in srgb,\s*var\(--dsnr-brand\)\s*\d+%,\s*black\)/);
		const highContrast = css.split('}').find((b) => b.includes('body.vscode-high-contrast')) ?? '';
		expect(highContrast).toMatch(/--dsnr-brand:\s*var\(--vscode-button-background\)/);
		expect(highContrast).toMatch(/--dsnr-on-brand:\s*var\(--vscode-button-foreground\)/);
	});
});

describe('links', () => {
	const hex = (css: string, theme: ':root' | ':root.dark', name: string): string => {
		const block = new RegExp(`(?:^|\\})\\s*(?:/\\*[\\s\\S]*?\\*/\\s*)?${theme.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';
		const found = new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(block)?.[1];
		if (!found) throw new Error(`theme.css gives ${theme} no ${name}`);
		return found;
	};
	/** `color-mix(in srgb, a share%, b)`, as the browser mixes it. */
	const mixed = (a: string, share: number, b: string): string => {
		const channel = (c: string, at: number) => Number.parseInt(c.slice(1 + at * 2, 3 + at * 2), 16);
		return `#${[0, 1, 2]
			.map((i) =>
				Math.round((channel(a, i) * share) / 100 + (channel(b, i) * (100 - share)) / 100)
					.toString(16)
					.padStart(2, '0'),
			)
			.join('')}`;
	};

	it('are the brand’s, one colour made once from it, on a light surface and on a dark one, readable on both', () => {
		const theme = readFileSync(join(root, 'src/ui/theme.css'), 'utf8');
		const surfaces = ['--vscode-editor-background', '--vscode-sideBar-background', '--vscode-editorWidget-background'];
		for (const name of [':root', ':root.dark'] as const) {
			const link = mixed(BRAND, LINK_SHARE, hex(theme, name, '--vscode-foreground'));
			for (const surface of surfaces) expect(contrastRatio(link, hex(theme, name, surface)), `${name} ${surface}`).toBeGreaterThanOrEqual(4.5);
		}
		const kit = readFileSync(join(root, 'src/ui/kit.css'), 'utf8');
		expect(kit).toMatch(/--dsnr-link:\s*color-mix\(in srgb,\s*var\(--dsnr-brand\)\s*var\(--dsnr-link-share\),\s*var\(--vscode-foreground\)\)/);
		expect(kit).toMatch(/\.link,\s*a:not\(\.icon-button\)\s*\{\s*color:\s*var\(--dsnr-link\)/);
	});

	it('are never given another colour: only the theme’s own link colour is read, and only to give way in high contrast', () => {
		const reads = ['src', 'extension']
			.flatMap((dir) => sourceFiles(join(root, dir)))
			.filter((path) => path.endsWith('.css') && !path.endsWith('theme.css'))
			.filter((path) => readFileSync(path, 'utf8').includes('--vscode-textLink-foreground'))
			.map((path) => relative(root, path));
		expect(reads).toEqual(['src/ui/kit.css']);
		const highContrast =
			readFileSync(join(root, 'src/ui/kit.css'), 'utf8')
				.split('}')
				.find((b) => b.includes('body.vscode-high-contrast')) ?? '';
		expect(highContrast).toMatch(/--dsnr-link:\s*var\(--vscode-textLink-foreground\)/);
	});
});
