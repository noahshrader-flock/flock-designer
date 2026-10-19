import { BRAND } from './brand';

/**
 * The colours DSNR draws inside a page it does not style (a prototype's, a story's frame), which cannot see the kit's
 * theme: the one palette for them, the brand from `brand.ts`, the rest Tailwind's so they sit well on any page.
 */
const PIN = BRAND;

/** The pin's colour as red, green and blue, 0 to 255: what a check that counts its pixels compares against. */
export const PIN_RGB = [1, 3, 5].map((i) => parseInt(PIN.slice(i, i + 2), 16)) as [number, number, number];

export const INK = {
	/** tailwind violet-600: DSNR's brand */
	pin: PIN,
	/** the pin's colour at 8% */
	pinWash: `rgba(${PIN_RGB.join(',')},.08)`,
	/** tailwind amber-500: a pin being placed, not yet saved */
	draft: '#f59e0b',
	on: '#fff',
	shadow: 'rgba(0,0,0,.45)',
	/** What a picture or a story is drawn on, as a page is. */
	paper: '#fff',
	/** tailwind gray-500: a story's name over it */
	muted: '#6b7280',
	/** tailwind red-700: what went wrong drawing it */
	error: '#b91c1c',
} as const;
