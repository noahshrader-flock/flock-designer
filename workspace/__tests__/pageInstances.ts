/**
 * The page code that finds a component's instances (`page/instances.ts`), as scripts a test runs in a preview page: what
 * the drawing and the preview page call themselves, called from outside to look at what they found.
 */
import INSTANCES from '../src/page/instances?page';

/** A function finding the instances of a component the page's stories draw: `(0, eval)(FIND_INSTANCES)(component)`. */
export const FIND_INSTANCES = `(() => {\n${INSTANCES}\nreturn __fdPage.findInstances;\n})()`;
/** The preview page's part that sets the values a tab tries on the instances (`tryValues`), started where it runs. */
export const TRY_VALUES = `(() => {\n${INSTANCES}\n__fdPage.tryValues();\n})();`;
