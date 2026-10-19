/**
 * The colors DSNR draws *inside someone else's page*: literals on purpose, and the only place that is right, since the
 * previewed product's document cannot see DSNR's theme. Tailwind's values, so they match around them; the brand agrees
 * with `--dsnr-brand` (a guard test says so), and the page smoke test reads these same colours.
 */
const PIN = '#7c3aed';

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
} as const;
