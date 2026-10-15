import { isAppearance } from '../../shared/appearance';
import { arg, handle } from '../handle';
import type { IpcDeps } from '../ipc';

/**
 * Signing in to GitHub, and the person's own settings.
 */
export const registerAccount = (d: IpcDeps): void => {
	const { appearanceMemory, applyAppearance, github } = d;

	handle('signInState', [], () => github.state());
	handle('signOut', [], () => {
		github.signOut();
		return null;
	});
	handle('appearance', [], async () => appearanceMemory.read());
	handle('setAppearance', [arg.unknown], async (appearance) => {
		if (!isAppearance(appearance)) throw new Error('That is not an appearance: Auto, Light or Dark.');
		// Applied before it is kept: a setting that could not be applied must not be what the app opens with.
		applyAppearance(appearance);
		appearanceMemory.write(appearance);
		return appearance;
	});
};
