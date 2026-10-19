import { AVATAR_XS, BRAND, LEADING, ON_BRAND, OPACITY, RADIUS, SPACE, TEXT, WEIGHT } from '../shared/dsnrTokens';

const kebab = (name: string) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** `--dsnr-{family}-{name}` for each; `base` is the family's own name (`--dsnr-radius`). */
const family = (prefix: string, values: Record<string, number>, unit = '') =>
	Object.entries(values).map(([name, value]) => [name === 'base' ? `--dsnr-${prefix}` : `--dsnr-${prefix}-${kebab(name)}`, `${value}${unit}`]);

/** The base tokens as the kit's names (`--dsnr-brand`, `--dsnr-space-1`…), which `kit.css` uses but does not write. */
export const tokenProperties = (): Record<string, string> =>
	Object.fromEntries([
		['--dsnr-brand', BRAND],
		['--dsnr-on-brand', ON_BRAND],
		...family('space', SPACE, 'px'),
		...family('radius', RADIUS, 'px'),
		...family('weight', WEIGHT),
		...family('text', TEXT, 'px'),
		['--dsnr-leading', String(LEADING)],
		...family('opacity', OPACITY),
		['--dsnr-avatar-xs', `${AVATAR_XS}px`],
	]);

/** Gives a page the base tokens: called once, as each page drawn with the kit starts, before it draws. */
export const applyTokens = (doc: Document): void => {
	for (const [name, value] of Object.entries(tokenProperties())) doc.documentElement.style.setProperty(name, value);
};

/** The same, as a stylesheet, for a page put together without running its script (a test's). */
export const tokenCss = (): string =>
	`:root {\n${Object.entries(tokenProperties())
		.map(([name, value]) => `\t${name}: ${value};`)
		.join('\n')}\n}`;
