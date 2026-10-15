/**
 * The colors of the things this app draws *inside someone else's page*.
 *
 * Written as literals on purpose, and the only place in the app where that is right: these live in the previewed
 * product's document, which has its own stylesheet and cannot see this app's theme. They are Tailwind's own values
 * rather than anything chosen by hand (violet-600, DSNR's brand, for a pin and the outline that shows what it will attach
 * to, amber-500 for one not yet saved) so they match the app around them. White and a plain shadow keep a pin legible on
 * whatever it lands on. The brand is also in the extension's stylesheet (`--dsnr-brand`), which a guard test says agrees.
 *
 * Shared, with nothing of a page in it, so the app's own checks (the page smoke test) read the same colours the page draws.
 */
export const INK = {
	/** tailwind violet-600: DSNR's brand */
	pin: '#7c3aed',
	/** tailwind violet-600 at 8% */
	pinWash: 'rgba(124,58,237,.08)',
	/** tailwind amber-500: a pin being placed, not yet saved */
	draft: '#f59e0b',
	on: '#fff',
	shadow: 'rgba(0,0,0,.45)',
} as const;
