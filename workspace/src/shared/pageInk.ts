import { BRAND } from './brand';

/** For drawing inside a page DSNR does not style, which cannot see the kit's theme. */
const PIN = BRAND;

export const PIN_RGB = [1, 3, 5].map((i) => parseInt(PIN.slice(i, i + 2), 16)) as [number, number, number];

export const INK = {
	pin: PIN,
	pinWash: `rgba(${PIN_RGB.join(',')},.08)`,
	/** A pin being placed, not yet saved. */
	draft: '#f59e0b',
	on: '#fff',
	shadow: 'rgba(0,0,0,.45)',
	paper: '#fff',
	muted: '#6b7280',
	error: '#b91c1c',
} as const;
