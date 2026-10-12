import { basename } from 'node:path';
import type { Checkout, CheckoutSuggestion, RepositoryList } from '../../shared/contract';
import { arg, emit, handle } from '../handle';
import { buildContextReceipt } from '../services/contextReceipt';
import { DESCRIPTOR_PATH, findCommand, readDescriptor } from '../services/descriptor';
import { branchCommit, branchesWithFile, readCheckout, recentBranches } from '../services/git';
import { INSTALL_COMMAND } from '../services/install';
import { continueIteration, readIterations, recordedIteration } from '../services/iterations';
import { mergeRepositories, originOf, reachableRepositories } from '../services/repositories';
import type { IpcDeps } from '../ipc';
import { parseRemote } from '../../shared/repoRef';

/**
 * How the window opens a product checkout and works in it: choosing or accepting one, its branches and iterations,
 * its commands, and installing its packages.
 */
export const registerCheckout = (d: IpcDeps): void => {
	const {
		agent,
		assertAgentNotHere,
		checkout,
		cloneFolder,
		cloneFolders,
		github,
		installer,
		openRepository,
		personGitHub,
		ports,
		productCheckouts,
		runtime,
		signedInLogin,
		state,
		trustedRoot,
		window,
		written,
	} = d;

	handle('chooseCheckout', [], async (): Promise<Checkout | null> => {
		const chosen = await ports.chooseFolder({ title: 'Open a product repository' });
		return chosen === null ? null : openRepository(chosen);
	});
	handle('lastCheckout', [], async (): Promise<Checkout | null> => {
		const root = trustedRoot();
		return root === null ? null : openRepository(root);
	});
	// Finding a repository grants it nothing: this only describes one, and
	// `useCheckout` is the step that trusts it.
	handle('suggestCheckout', [], (): CheckoutSuggestion | null => {
		if (trustedRoot() !== null) return null;
		const root = productCheckouts()[0];
		if (root === undefined) return null;
		try {
			return { root, name: basename(root), product: readDescriptor(root).product };
		} catch {
			// A descriptor we cannot read is not a repository we should offer.
			return null;
		}
	});
	// Not `checkout`: the folder is one discovery found, not yet one the person opened; accepting it is what opens it.
	handle('useCheckout', [arg.root], async (root): Promise<Checkout> => {
		// Only ever a repository discovery itself found, so the renderer cannot
		// name an arbitrary directory and have it trusted.
		if (!productCheckouts().includes(root)) {
			throw new Error('That is not a repository DSNR found on this machine.');
		}
		return openRepository(root);
	});
	handle('cloneFolder', [], cloneFolder);
	// Chosen with the system's picker, here: the window never names a folder to put files in.
	handle('chooseCloneFolder', [], async (): Promise<string | null> => {
		const chosen = await ports.chooseFolder({ title: 'Choose where repositories are cloned', defaultPath: cloneFolder(), canCreate: true });
		if (chosen === null) return null;
		cloneFolders.write(chosen);
		return chosen;
	});
	handle('listRepositories', [], async (): Promise<RepositoryList> => {
		const clones = productCheckouts().map((root) => {
			const origin = originOf(root);
			return { root, repo: origin === null ? null : parseRemote(origin) };
		});
		// Signed out, or GitHub out of reach: what is on this machine can still be started in.
		const remote =
			github.state().state === 'signedIn'
				? await reachableRepositories(github, personGitHub, signedInLogin())
				: { names: [], reach: 'none' as const };
		if (remote.names.length > 0) state.visible = remote.names;
		return { repositories: mergeRepositories(remote.names, clones), reach: remote.reach };
	});
	handle('listBaseBranches', [checkout], (workIn) => recentBranches(workIn.canonical));
	handle('branchesWithSetup', [checkout], (workIn) => branchesWithFile(workIn.canonical, DESCRIPTOR_PATH));
	// Re-reads a checkout the person already opened; it trusts and remembers nothing, so the window naming a folder
	// is never enough to make it trusted (only the picker, a repository discovery found, the last one, and a clone are).
	handle('readCheckout', [checkout], (workIn) => readCheckout(workIn.canonical));
	handle('readContextReceipt', [checkout], (workIn) => buildContextReceipt(workIn.canonical, workIn.descriptor));
	handle('listIterations', [checkout, arg.projectId], (workIn, projectId) => readIterations(workIn.recordsRoot, projectId));
	handle('continueIteration', [checkout, arg.projectId, arg.iterationName], async (workIn, projectId, name) => {
		const { canonical } = workIn;
		// Opening the run's own work is fine: the checkout is already on its branch, so nothing moves.
		if (agent.runningIn(canonical)) {
			const wanted = await recordedIteration(canonical, workIn.recordsRoot, workIn.descriptor, projectId, name);
			if ((await readCheckout(canonical)).branch !== wanted.branch) assertAgentNotHere(canonical);
		}
		return written(await continueIteration(canonical, workIn.recordsRoot, projectId, name, signedInLogin(), workIn.descriptor));
	});
	handle('startCommand', [checkout, arg.name, arg.optional(arg.projectId)], (workIn, commandId, projectId) =>
		runtime.start(workIn.canonical, workIn.descriptor, commandId, projectId ?? undefined),
	);
	// Only for a checkout the person opened, though the runtime knows its commands by id alone.
	handle('stopCommand', [checkout, arg.name], (_workIn, commandId) => runtime.stop(commandId));
	handle('commandStatus', [checkout, arg.name], (_workIn, commandId) => runtime.status(commandId));
	// Installing a repository's packages, from the New modal: only the command it declares, one at a time, stoppable.
	handle('installPackages', [checkout], async (workIn): Promise<null> => {
		const { canonical } = workIn;
		// Its packages change under a running agent otherwise.
		if (agent.runningIn(canonical)) throw new Error(`The agent is working in ${basename(canonical)}. Install the packages when it has finished.`);
		const command = findCommand(workIn.descriptor, INSTALL_COMMAND);
		const stop = (state.installing = new AbortController());
		try {
			await installer.install(canonical, command, (line) => emit(window, 'onInstallLine', line), stop.signal);
		} finally {
			state.installing = null;
		}
		return null;
	});
	handle('cancelInstall', [], () => {
		state.installing?.abort();
		return null;
	});
	// What the branch is at right now: read when a comment is placed, so the comment says
	// which version of the code it was made against rather than which one was last recorded.
	handle('iterationCommit', [checkout, arg.projectId, arg.iterationName], async (workIn, projectId, name): Promise<string | null> => {
		const { canonical } = workIn;
		const found = await recordedIteration(canonical, workIn.recordsRoot, workIn.descriptor, projectId, name).catch(() => null);
		return found ? branchCommit(canonical, found.branch).catch(() => null) : null;
	});
};
