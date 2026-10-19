/**
 * Bundled as one script (`?page`) that names it `__fdPage` (`pageScripts.ts`), so tests call what the page agent
 * (`src/page/agentMain.ts`) carries directly.
 */
export { pick } from '../src/page/pick';
export { drawPins, setLayersVisible } from '../src/page/pins';
