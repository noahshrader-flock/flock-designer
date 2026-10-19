/** Data attributes a kit piece is found and marked by (`data-token`, `data-changed`, `data-value-cell`…), given by its caller. */
export type Marks = Record<`data-${string}`, string | boolean | undefined>;
