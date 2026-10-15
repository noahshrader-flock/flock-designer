/**
 * The code that runs inside a previewed page, as real modules: typed, linted and scoped like the rest. It is bundled
 * into one script (`pageCode.vite.ts`, `pageBundle.mjs`), which the page agent carries into every page.
 */
export { pick } from './pick';
export { drawPins, setLayersVisible } from './pins';
