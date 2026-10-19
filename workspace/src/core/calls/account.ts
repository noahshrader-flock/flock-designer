import { handle } from '../handle';
import type { AccountArea } from '../areas/account';

export const registerAccount = (area: AccountArea): void => {
	handle('signInState', [], area.signInState);
	handle('signOut', [], area.signOut);
};
