import type { Checkout } from '../../shared/contract';
import { arg, handle } from '../handle';
import type { IpcDeps } from '../ipc';

/**
 * Cloning a repository from the person's GitHub list, with the design repository beside it when it needs one.
 */
export const registerClone = (d: IpcDeps): void => {
	const { cloneAsPlanned, cloneFolder, openRepository, planClone, startAtSetup, state } = d;

	handle('clonePlan', [arg.name, arg.flag], (repository, forDesignSystem) => planClone(repository, cloneFolder(), forDesignSystem === true));
	handle('cloneRepository', [arg.name], async (repository): Promise<Checkout> => {
		const { path: product, cloned: fresh, repository: listed } = await cloneAsPlanned(repository);
		await startAtSetup(listed, product, fresh);
		return openRepository(product);
	});
	handle('cancelClone', [], () => {
		state.cloning?.abort();
		return null;
	});
};
