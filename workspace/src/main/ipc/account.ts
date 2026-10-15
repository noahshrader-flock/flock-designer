import { handle } from '../handle';
import type { IpcDeps } from '../ipc';

/**
 * The person's GitHub sign-in state, and signing out of DSNR.
 */
export const registerAccount = (d: IpcDeps): void => {
	const { github } = d;

	handle('signInState', [], () => github.state());
	handle('signOut', [], () => {
		github.signOut();
		return null;
	});
};
