import type { DesignToken } from '../../src/shared/contract';
import { labelOf } from '../../src/shared/tokens';

export const tokenDot = (token: DesignToken): { value: string; name: string; says: string } => ({
	value: token.value,
	name: labelOf(token),
	says: labelOf(token),
});
