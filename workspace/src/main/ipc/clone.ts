import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Checkout } from '../../shared/contract';
import { arg, handle } from '../handle';
import { DESCRIPTOR_PATH } from '../services/descriptor';
import { branchesWithFile, checkoutBranch, ensureLocalBranch, readCheckout } from '../services/git';
import type { IpcDeps } from '../ipc';

/**
 * Cloning a repository from the person's GitHub list, with the design repository beside it when it needs one.
 */
export const registerClone = (d: IpcDeps): void => {
	const { cloneAsPlanned, cloneFolder, openRepository, planClone, state } = d;

	/**
	 * A clone is used on a branch with the DSNR setup, since the app reads it from the files there. A clone just
	 * made is moved to the most recently committed branch that has it (it holds nothing of the person's yet); one that
	 * was already there is the person's, so it is never moved, and they are told which branch to switch it to.
	 */
	const startAtSetup = async (repository: string, root: string, fresh: boolean): Promise<void> => {
		if (existsSync(join(root, DESCRIPTOR_PATH))) return;
		const here = (await readCheckout(root)).branch ?? 'no branch';
		const good = (await branchesWithFile(root, DESCRIPTOR_PATH))[0];
		if (good === undefined) {
			throw new Error(`Cloned, but no branch of ${repository.split('/')[1]} has the DSNR setup (${DESCRIPTOR_PATH}), so it can't be used here yet.`);
		}
		if (!fresh) throw new Error(`${root} is on ${here}, which has no DSNR setup. Switch it to ${good}, which has it, then try again.`);
		await ensureLocalBranch(root, good);
		await checkoutBranch(root, good);
	};

	handle('clonePlan', [arg.name, arg.flag], (repository, forDesignSystem) => planClone(repository, cloneFolder(), forDesignSystem));
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
