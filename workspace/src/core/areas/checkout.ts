import type { CallsDeps } from '../compose';
import type { CheckedCheckout } from '../compose';
import { basename } from 'node:path';
import { DESCRIPTOR_PATH, findCommand } from '../services/projects/descriptor';
import { branchesWithFile, readCheckout } from '../services/platform/git';
import { INSTALL_COMMAND } from '../services/codebase/install';
import { continueWork, recordedWork } from '../services/projects/workRecords';

/** What the Checkout calls do, each called by its handler once its arguments are checked (`calls/checkout.ts`). */
export const checkoutArea = (d: CallsDeps) => {
	const { agent, assertAgentNotHere, checkout, installer, runtime, signedInLogin, state, emit, written } = d;
	return {
		/** The check a root the window names goes through: one this window opened, read whole (`calls.ts`). */
		checkout,
		branchesWithSetup: (workIn: CheckedCheckout) => branchesWithFile(workIn.canonical, DESCRIPTOR_PATH),
		// Re-reads a checkout the person already opened; it trusts and remembers nothing, so the window naming a folder
		// is never enough to make it trusted (only the picker, a repository discovery found, the last one, and a clone are).
		readCheckout: (workIn: CheckedCheckout) => readCheckout(workIn.canonical),
		continueWork: async (workIn: CheckedCheckout, projectId: string, name: string) => {
			const { canonical } = workIn;
			// Opening the run's own work is fine: the checkout is already on its branch, so nothing moves.
			if (agent.runningIn(canonical)) {
				const wanted = await recordedWork(canonical, workIn.recordsRoot, workIn.descriptor, projectId, name);
				if ((await readCheckout(canonical)).branch !== wanted.branch) assertAgentNotHere(canonical);
			}
			return written(await continueWork(canonical, workIn.recordsRoot, projectId, name, signedInLogin(), workIn.descriptor));
		},
		startCommand: (workIn: CheckedCheckout, commandId: string, projectId: string | null) =>
			runtime.start(workIn.canonical, workIn.descriptor, commandId, projectId ?? undefined),
		// Only for a checkout the person opened, though the runtime knows its commands by id alone.
		stopCommand: (_workIn: CheckedCheckout, commandId: string) => runtime.stop(commandId),
		// Installing a repository's packages, from the New modal: only the command it declares, one at a time, stoppable.
		installPackages: async (workIn: CheckedCheckout): Promise<null> => {
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
		},
		cancelInstall: () => {
			state.installing?.abort();
			return null;
		},
	};
};

export type CheckoutArea = ReturnType<typeof checkoutArea>;
