import type { CallsDeps, CheckedCheckout } from '../compose';
import { DESCRIPTOR_PATH, findCommand } from '../services/projects/descriptor';
import { branchesWithFile, readCheckout } from '../services/platform/git';
import { INSTALL_COMMAND } from '../services/codebase/install';

export const checkoutArea = (d: CallsDeps) => {
	const { checkout, installer, runtime, emit } = d;
	let installing: AbortController | null = null;
	return {
		checkout,
		branchesWithSetup: (workIn: CheckedCheckout) => branchesWithFile(workIn.canonical, DESCRIPTOR_PATH),
		readCheckout: (workIn: CheckedCheckout) => readCheckout(workIn.canonical),
		stopCommand: (_workIn: CheckedCheckout, commandId: string) => runtime.stop(commandId),
		installPackages: async (workIn: CheckedCheckout): Promise<null> => {
			const { canonical } = workIn;
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
