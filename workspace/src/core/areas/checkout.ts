import type { CallsDeps, CheckedCheckout } from '../compose';
import { DESCRIPTOR_PATH } from '../services/products/descriptor';
import { branchesWithFile } from '../services/platform/git';

export const checkoutArea = (d: CallsDeps) => {
	const { checkout, runtime } = d;
	return {
		checkout,
		branchesWithSetup: (workIn: CheckedCheckout) => branchesWithFile(workIn.canonical, DESCRIPTOR_PATH),
		stopCommand: (_workIn: CheckedCheckout, commandId: string) => runtime.stop(commandId),
	};
};

export type CheckoutArea = ReturnType<typeof checkoutArea>;
