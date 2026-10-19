/**
 * A color, as a small circle, or large (`large`) as Primitives draws a palette. Its color is the token's own, a value known
 * only as it runs, so it is set on the element (through the DOM, which the page's policy allows), never in a style sheet.
 */
export const Swatch = ({ value, large = false }: { value: string; large?: boolean }) => (
	<span data-swatch className={large ? 'swatch swatch-large' : 'swatch'} style={{ backgroundColor: value }} />
);
