/**
 * A component's instances in a preview page, as the scripts that run in it: the page code (`page/instances.ts`, typed and
 * linted like the rest) bundled to text when DSNR is built (`?page`), and each script the one part of it a reader runs.
 */
import INSTANCES from '../../../page/instances?page';

/** An expression that is one function of the page code, for a script to call: `(${FIND_INSTANCES})(component)`. */
const part = (name: 'findInstances' | 'borderColor' | 'readValues'): string => `(() => {\n${INSTANCES}\nreturn __fdPage.${name};\n})()`;

/** The instances of a component the page's stories draw (`findInstances`). */
export const FIND_INSTANCES = part('findInstances');
/** An element's border colour, from its computed style (`borderColor`). */
export const BORDER_COLOR = part('borderColor');
/** An instance's values, from its top element (`readValues`). */
export const READ_VALUES = part('readValues');
/** The preview page's part that sets the values a tab tries on the instances (`tryValues`), started where it runs. */
export const TRY_VALUES = `(() => {\n${INSTANCES}\n__fdPage.tryValues();\n})();`;
