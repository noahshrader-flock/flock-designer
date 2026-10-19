import INSTANCES from '../src/page/instances?page';

/** Used as `(0, eval)(FIND_INSTANCES)(component)`. */
export const FIND_INSTANCES = `(() => {\n${INSTANCES}\nreturn __fdPage.findInstances;\n})()`;
export const TRY_VALUES = `(() => {\n${INSTANCES}\n__fdPage.tryValues();\n})();`;
