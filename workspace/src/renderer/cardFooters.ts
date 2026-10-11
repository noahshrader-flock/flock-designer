/**
 * The footers of the grids' cards, said once, so a card and its loading skeleton are the same size and nothing jumps when it
 * arrives, and every card in a row lines up. Both start at 18px, where a card's content starts.
 */

/** A card's name, the same on every card: one size up from the text around it, on one line and cut short when long. */
export const CARD_NAME = 'truncate text-base font-semibold';

/** A component: one row, its name at the left and its group at the right. */
export const COMPONENT_FOOTER = 'mt-auto flex h-12 items-center justify-between gap-2 pr-3 pl-4.5';

/** A project: two rows, its name, and under it who it is by at the left and what it has at the right. */
export const PROJECT_FOOTER = 'mt-auto flex h-20 flex-col items-stretch justify-center gap-1 py-3 pr-3 pl-4.5';
