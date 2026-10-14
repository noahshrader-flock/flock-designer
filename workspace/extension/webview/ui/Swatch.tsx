/**
 * A color, as a small square, or wide (`wide`) as Primitives draws a palette. Its color is the token's own, a value known
 * only as it runs, so it is set on the element (through the DOM, which the page's policy allows), never in a style sheet.
 */
export const Swatch = ({ value, wide = false }: { value: string; wide?: boolean }) => (
	<span data-swatch className={wide ? 'swatch swatch-wide' : 'swatch'} style={{ backgroundColor: value }} />
);
