/**
 * How long a pointer stays on something before it is told what it is: **one wait for every tooltip DSNR draws**, in its
 * pages in VS Code (`src/ui/Tooltip.tsx`) and in the review bar on the published site (`src/viewer/ui/tooltip.tsx`),
 * which are drawn with two kits but wait alike. Nothing sets a delay of its own.
 */
export const TOOLTIP_DELAY_MS = 1000;

/** Once one has been told, the next opens at once for this long: moving along a row of buttons is not a wait for each. */
export const TOOLTIP_SKIP_MS = 300;
