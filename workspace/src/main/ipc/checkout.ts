import { basename } from 'node:path';
import { arg, handle } from '../handle';
import { DESCRIPTOR_PATH, findCommand } from '../services/descriptor';
import { branchCommit, branchesWithFile, readCheckout } from '../services/git';
import { INSTALL_COMMAND } from '../services/install';
import { continueWork, recordedWork } from '../services/workRecords';
import type { IpcDeps } from '../ipc';

/**
 * How the window opens a product checkout and works in it: choosing or accepting one, its branches and work,
 * its commands, and installing its packages.
 */
export const registerCheckout = (d: IpcDeps): void => {
	const { agent, assertAgentNotHere, checkout, installer, runtime, signedInLogin, state, emit, written } = d;

	handle('branchesWithSetup', [checkout], (workIn) => branchesWithFile(workIn.canonical, DESCRIPTOR_PATH));
	// Re-reads a checkout the person already opened; it trusts and remembers nothing, so the window naming a folder
	// is never enough to make it trusted (only the picker, a repository discovery found, the last one, and a clone are).
	handle('readCheckout', [checkout], (workIn) => readCheckout(workIn.canonical));
	handle('continueWork', [checkout, arg.projectId, arg.codebaseName], async (workIn, projectId, name) => {
		const { canonical } = workIn;
		// Opening the run's own work is fine: the checkout is already on its branch, so nothing moves.
		if (agent.runningIn(canonical)) {
			const wanted = await recordedWork(canonical, workIn.recordsRoot, workIn.descriptor, projectId, name);
			if ((await readCheckout(canonical)).branch !== wanted.branch) assertAgentNotHere(canonical);
		}
		return written(await continueWork(canonical, workIn.recordsRoot, projectId, name, signedInLogin(), workIn.descriptor));
	});
	handle('startCommand', [checkout, arg.name, arg.optional(arg.projectId)], (workIn, commandId, projectId) =>
		runtime.start(workIn.canonical, workIn.descriptor, commandId, projectId ?? undefined),
	);
	// Only for a checkout the person opened, though the runtime knows its commands by id alone.
	handle('stopCommand', [checkout, arg.name], (_workIn, commandId) => runtime.stop(commandId));
	// Installing a repository's packages, from the New modal: only the command it declares, one at a time, stoppable.
	handle('installPackages', [checkout], async (workIn): Promise<null> => {
		const { canonical } = workIn;
		// Its packages change under a running agent otherwise.
		if (agent.runningIn(canonical)) throw new Error(`The agent is working in ${basename(canonical)}. Install the packages when it has finished.`);
		const command = findCommand(workIn.descriptor, INSTALL_COMMAND);
		const stop = (state.installing = new AbortController());
		try {
			await installer.install(canonical, command, (line) => emit('onInstallLine', line), stop.signal);
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
	handle('workCommit', [checkout, arg.projectId, arg.codebaseName], async (workIn, projectId, name): Promise<string | null> => {
		const { canonical } = workIn;
		const found = await recordedWork(canonical, workIn.recordsRoot, workIn.descriptor, projectId, name).catch(() => null);
		return found ? branchCommit(canonical, found.branch).catch(() => null) : null;
	});
};
