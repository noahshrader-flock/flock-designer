/**
 * What the grids' cards share in their footers, said once, so every card is the same and a card and its loading skeleton
 * are the same size: nothing jumps when it arrives, and every card in a row lines up. Content starts at 18px.
 */

/** A card's name, the same on every card: on one line, cut short with an ellipsis when long, never a second. */
export const CARD_NAME = 'truncate text-sm font-semibold';

/** What a card says beside or under its name (a component's group, who a project is by, what it has): the one gray. */
export const CARD_DETAIL = 'text-muted-foreground text-sm';

/** A component: one row, its name at the left and its group at the right. */
export const COMPONENT_FOOTER = 'mt-auto flex h-12 items-center justify-between gap-2 pr-3 pl-4.5';

/** A project: two rows, its name, and under it who it is by at the left and what it has at the right. */
export const PROJECT_FOOTER = 'mt-auto flex h-18 flex-col items-stretch justify-center gap-1 py-3 pr-3 pl-4.5';
