import PAGE from './pageEntry?page';
import type { MarkerRequest } from '../src/shared/contract';

/**
 * The page code (`src/page`) as the tests run it inside a page, as the text of a script (`pageEntry.ts`), bundled once, then
 * the one call each needs, all in a function of its own so nothing of it is left on the page's window but the hooks it is
 * called by (`src/page/window.d.ts`).
 *
 * Text, not functions: a script is run in another process, so it is sent as source. Each script returns its result to
 * the app. The page is given no function to call; the one thing a pin needs to say back ("I was clicked", "I was moved")
 * goes out as a console message carrying a per-preview secret, which the app listens for and validates (`pageReaders.ts`, as the review bar's answers are). The page can see
 * these scripts and could tamper with them or forge a message, which is why everything that comes back is validated, and
 * why the worst a forged message can do is move or select a pin that exists.
 */
const run = (call: string): string => `(function () {\n${PAGE}\nreturn __fdPage.${call};\n})()`;

/** Pin mode: resolves with where the next click landed, or null when the person presses Escape or the app cancels. */
export const PICK_SCRIPT = run('pick()');

/** Hides or shows the app's own layers, and resolves once the page has painted that (a picture is taken meanwhile). */
export const layerVisibleScript = (visible: boolean): string => run(`setLayersVisible(${visible ? 'true' : 'false'})`);

export const CANCEL_PICK_SCRIPT = 'window.__fdCancelPick && window.__fdCancelPick()';

/** Draws a numbered pin on each comment's element, and returns how each was placed (`drawPins`). */
export const resolveScript = (items: MarkerRequest[], nonce: string): string => run(`drawPins(${JSON.stringify(items)}, ${JSON.stringify(nonce)})`);

export const focusScript = (id: number): string => `window.__fdMarkers && window.__fdMarkers.focus(${Number.isInteger(id) ? id : -1})`;

export const ROUTE_SCRIPT = 'location.pathname + location.hash';

/**
 * Put before any script run on a prototype: it is one page, so a comment is placed by what follows its #, not by the
 * address it happens to be served at. The same comment then has its pin in the app and on the published site.
 */
export const SINGLE_PAGE = 'window.__fdSinglePage = true;';
