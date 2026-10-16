/**
 * WCAG's relative luminance and contrast ratio, the one way they are worked out: for the token panel's color pairs
 * (`tokens.ts`), and for what the probe measures in a page (`page/probe.ts`) and in its pictures (`services/probe`).
 */

/** A color's red, green and blue, 0 to 255. */
export type Rgb = readonly [number, number, number];

/** WCAG's relative luminance of a color, 0 (black) to 1 (white). */
export const luminanceOf = ([r, g, b]: Rgb): number => {
	const [lr, lg, lb] = [r, g, b].map((v) => {
		const c = v / 255;
		return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	}) as [number, number, number];
	return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

/** WCAG's contrast ratio of two colors, 1 to 21, unrounded: each reader rounds it as it shows it. */
export const contrastOf = (a: Rgb, b: Rgb): number => {
	const [light, dark] = [luminanceOf(a), luminanceOf(b)].sort((x, y) => y - x) as [number, number];
	return (light + 0.05) / (dark + 0.05);
};
