import type { CallsDeps, CheckedCheckout } from '../compose';
import { basename } from 'node:path';
import { DESCRIPTOR_PATH, findCommand } from '../services/projects/descriptor';
import { branchesWithFile, readCheckout } from '../services/platform/git';
import { INSTALL_COMMAND } from '../services/codebase/install';

/** What the Checkout calls do, each called by its handler once its arguments are checked (`calls/checkout.ts`). */
export const checkoutArea = (d: CallsDeps) => {
	const { agent, checkout, installer, runtime, emit } = d;
	// The install in progress, which Cancel stops.
	let installing: AbortController | null = null;
	return {
		/** The check a root the window names goes through: one this window opened, read whole (`calls.ts`). */
		checkout,
		branchesWithSetup: (workIn: CheckedCheckout) => branchesWithFile(workIn.canonical, DESCRIPTOR_PATH),
		readCheckout: (workIn: CheckedCheckout) => readCheckout(workIn.canonical),
		stopCommand: (_workIn: CheckedCheckout, commandId: string) => runtime.stop(commandId),
		// Installing a repository's packages, from the New modal: only the command it declares, one at a time, stoppable.
		installPackages: async (workIn: CheckedCheckout): Promise<null> => {
			const { canonical } = workIn;
			// Its packages change under a running agent otherwise.
			if (agent.runningIn(canonical)) throw new Error(`The agent is working in ${basename(canonical)}. Install the packages when it has finished.`);
			const command = findCommand(workIn.descriptor, INSTALL_COMMAND);
			const stop = (installing = new AbortController());
			try {
				await installer.install(canonical, command, (line) => emit('onInstallLine', line), stop.signal);
			} finally {
				installing = null;
			}
			return null;
		},
		cancelInstall: () => {
			installing?.abort();
			return null;
		},
	};
};

export type CheckoutArea = ReturnType<typeof checkoutArea>;
