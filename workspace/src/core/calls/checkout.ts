import { arg, handle } from '../handle';
import type { CheckoutArea } from '../areas/checkout';

export const registerCheckout = (area: CheckoutArea): void => {
	handle('branchesWithSetup', [area.checkout], area.branchesWithSetup);
	// Trusts and remembers nothing: the window naming a folder is never enough to make it trusted.
	handle('readCheckout', [area.checkout], area.readCheckout);
	// Only for a checkout the person opened, though the runtime knows its commands by id alone.
	handle('stopCommand', [area.checkout, arg.name], area.stopCommand);
	handle('installPackages', [area.checkout], area.installPackages);
	handle('cancelInstall', [], area.cancelInstall);
};
