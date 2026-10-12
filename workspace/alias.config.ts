import { resolve } from 'node:path';

/**
 * `@/` is the window's code, for every build and the tests alike. The two tsconfigs say the same in their own terms
 * (`paths`); the root one is also what shadcn's command line reads.
 */
export const alias = { '@': resolve(__dirname, 'src/renderer') };
