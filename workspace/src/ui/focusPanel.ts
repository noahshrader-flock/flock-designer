/**
 * The focus onto a panel itself (a value's popover, a token's dialog), not its first control, so a slider is not drawn as
 * chosen the moment it opens. The panel is `tabIndex={-1}` and takes no outline (`.popover:focus`, `.dialog:focus`).
 */
export const focusPanel = (panel: HTMLElement | null): void => panel?.focus({ preventScroll: true });
