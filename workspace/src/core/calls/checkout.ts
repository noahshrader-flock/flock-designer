import { arg, handle } from '../handle';
import type { CheckoutArea } from '../areas/checkout';

export const registerCheckout = (area: CheckoutArea): void => {
	handle('branchesWithSetup', [area.checkout], area.branchesWithSetup);
	// Only for a checkout the person opened, though the runtime knows its commands by id alone.
	handle('stopCommand', [area.checkout, arg.name], area.stopCommand);
};
