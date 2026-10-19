import type { DesignToken } from '../../src/shared/contract';
import { labelOf } from '../../src/shared/tokens';

/** What a color token's dot is (`ColorDot`): its color, called and told by its name, as the grid of roles and a token's row both have it. */
export const tokenDot = (token: DesignToken): { value: string; name: string; says: string } => ({
	value: token.value,
	name: labelOf(token),
	says: labelOf(token),
});
