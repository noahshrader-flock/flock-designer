import type { ChangeReach, TokenEdit } from '../../../src/shared/contract';
import { useTriedAnswer } from './useTriedAnswer';
import { workspace } from '../host';

/** What the token change being tried reaches, as it is worked out (`useTriedAnswer`). */
export const useChangeReach = (edits: TokenEdit[]): ChangeReach =>
	useTriedAnswer(JSON.stringify(edits), edits.length === 0, () => workspace().changeReach(edits));
