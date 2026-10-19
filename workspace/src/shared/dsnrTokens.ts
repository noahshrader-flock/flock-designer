/**
 * DSNR's base tokens, for its pages drawn with the kit (`applyTokens` sets them as `--dsnr-*`) and for what it draws where
 * the kit cannot reach (`pageTokens.ts`). Each value is written here once; a guard fails on one written anywhere else.
 */

/** DSNR's brand, the one colour of its own: its primary action, its marks, and its pins on a prototype's page. */
export const BRAND = '#7c3aed';

/** What is written on the brand: white, readable on it and on its hover (a guard holds it to WCAG AA). */
export const ON_BRAND = '#ffffff';

/** The spacing scale, in pixels, by step (`--dsnr-space-1`…): every padding, margin and gap is one of them. */
export const SPACE = { 1: 2, 2: 4, 3: 6, 4: 8, 5: 12, 6: 16, 7: 24, 8: 32 } as const;

/** Corner radii, in pixels; `round` makes a circle of a square. */
export const RADIUS = { small: 2, inner: 4, base: 6, large: 8, pill: 999 } as const;

export const WEIGHT = { regular: 400, medium: 500, semibold: 600, bold: 700 } as const;

/** Text sizes in pixels, for what is the same size whatever the size of the text around it. */
export const TEXT = { label: 11, labelSmall: 10 } as const;

/** Lines of text are this many times their size apart. */
export const LEADING = 1.4;

/** How clear a thing is drawn: `dim` for what cannot be used now, `receded` for what is done with but still there. */
export const OPACITY = { dim: 0.5, receded: 0.65 } as const;

/** An avatar's extra small size, in pixels: a card's and a pin's on the page alike. */
export const AVATAR_XS = 20;
