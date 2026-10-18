/**
 * The page code the tests run inside a page of their own, bundled as one script (`?page`) that names it `__fdPage`
 * (`pageScripts.ts`): what the page agent (`src/page/agentMain.ts`) carries into every page, called directly.
 */
export { pick } from '../src/page/pick';
export { drawPins, setLayersVisible } from '../src/page/pins';
