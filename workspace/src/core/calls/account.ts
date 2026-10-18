import { handle } from '../handle';
import type { CallsDeps } from '../calls';

/**
 * The person's GitHub sign-in state, and signing out of DSNR.
 */
export const registerAccount = (d: CallsDeps): void => {
	const { github } = d;

	handle('signInState', [], () => github.state());
	handle('signOut', [], () => {
		github.signOut();
		return null;
	});
};
