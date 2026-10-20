import { BRAND, LINK_SHARE, SPACE, TEXT } from './dsnrTokens';

/**
 * Tokens for what DSNR draws where the kit cannot reach (a prototype's page, a story's preview, the published site's
 * lists), as CSS values: the base tokens, and the few only these pages need, which are written here once.
 */

export const px = (n: number): string => `${n}px`;

/** A step of the spacing scale, as the kit's `--dsnr-space-*`. */
export const space = (step: keyof typeof SPACE): string => px(SPACE[step]);

export const INK = {
	pin: BRAND,
	pinWash: `color-mix(in srgb, ${BRAND} 8%, transparent)`,
	/** A link on a page that is light or dark as its reader's system is: the brand mixed into the page's own text. */
	link: `color-mix(in srgb, ${BRAND} ${LINK_SHARE}%, CanvasText)`,
	/** A pin being placed, not yet saved. */
	draft: '#f59e0b',
	on: '#fff',
	shadow: 'rgba(0,0,0,.45)',
	paper: '#fff',
	muted: '#6b7280',
	error: '#b91c1c',
	/** A border on a page that is light or dark as its reader's system is: grey, see-through, so it shows on either. */
	line: '#8884',
	lineStrong: '#888c',
} as const;

export const FONT = { ui: 'ui-sans-serif, system-ui, -apple-system, sans-serif', mono: 'ui-monospace, monospace' } as const;

/** Text sizes in pixels: the kit's label size, and the site's and a preview's own. */
export const SIZE = { label: TEXT.label, note: 12, body: 13, title: 22 } as const;

export { AVATAR_XS, LEADING, OPACITY, RADIUS, WEIGHT } from './dsnrTokens';

export const PIN_SHADOW = `0 2px 6px ${INK.shadow}`;
