import { handle } from '../handle';
import type { AccountArea } from '../areas/account';

/**
 * The person's GitHub sign-in state, and signing out of DSNR.
 */
export const registerAccount = (area: AccountArea): void => {
	handle('signInState', [], area.signInState);
	handle('signOut', [], area.signOut);
};
