import PAGE from './pageEntry?page';
import type { MarkerRequest } from '../src/shared/contract';

/**
 * Text, not functions: a script is run in another process, so it is sent as source. The page can see these scripts and
 * could tamper with them or forge a message, which is why everything that comes back is validated.
 */
const run = (call: string): string => `(function () {\n${PAGE}\nreturn __fdPage.${call};\n})()`;

/** Resolves with where the next click landed, or null when the person presses Escape or the app cancels. */
export const PICK_SCRIPT = run('pick()');

/** Resolves once the page has painted the change (a picture is taken meanwhile). */
export const layerVisibleScript = (visible: boolean): string => run(`setLayersVisible(${visible ? 'true' : 'false'})`);

export const CANCEL_PICK_SCRIPT = 'window.__fdCancelPick && window.__fdCancelPick()';

export const resolveScript = (items: MarkerRequest[], nonce: string): string => run(`drawPins(${JSON.stringify(items)}, ${JSON.stringify(nonce)})`);

export const focusScript = (id: number): string => `window.__fdMarkers && window.__fdMarkers.focus(${Number.isInteger(id) ? id : -1})`;

export const ROUTE_SCRIPT = 'location.pathname + location.hash';

/**
 * Put before any script run on a prototype: it is one page, so a comment is placed by what follows its #, not by the
 * address it happens to be served at.
 */
export const SINGLE_PAGE = 'window.__fdSinglePage = true;';
