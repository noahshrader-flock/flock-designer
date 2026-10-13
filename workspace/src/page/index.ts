/**
 * The code the app runs inside a previewed page, as real modules: typed, linted and scoped like the rest. It is bundled
 * into one script (`pageCode.vite.ts`), and each thing the app runs is that script and then one call to what is here
 * (`shared/pageScripts.ts`).
 */
export { pick } from './pick';
export { drawPins, setLayersVisible } from './pins';
