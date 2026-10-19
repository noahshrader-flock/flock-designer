/**
 * Where the focus goes when a few controls for one thing open over the page (a value's popover, a token's dialog): onto the
 * panel itself, not onto its first control. The keyboard is in it, and the first control is one Tab away, but a slider is not
 * drawn as chosen, with its ring, the moment it opens. The panel is `tabIndex={-1}` and takes no outline (`.popover:focus`,
 * `.dialog:focus`). One way for both, so they cannot differ.
 */
export const focusPanel = (panel: HTMLElement | null): void => panel?.focus({ preventScroll: true });
