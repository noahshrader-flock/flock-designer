import { arg, handle } from '../handle';
import type { CheckoutArea } from '../areas/checkout';

/**
 * How the window opens a product checkout and works in it: choosing or accepting one, its branches and work,
 * its commands, and installing its packages.
 */
export const registerCheckout = (area: CheckoutArea): void => {
	handle('branchesWithSetup', [area.checkout], area.branchesWithSetup);
	// Re-reads a checkout the person already opened; it trusts and remembers nothing, so the window naming a folder
	// is never enough to make it trusted (only the picker, a repository discovery found, the last one, and a clone are).
	handle('readCheckout', [area.checkout], area.readCheckout);
	handle('continueWork', [area.checkout, arg.projectId, arg.codebaseName], area.continueWork);
	handle('startCommand', [area.checkout, arg.name, arg.optional(arg.projectId)], area.startCommand);
	// Only for a checkout the person opened, though the runtime knows its commands by id alone.
	handle('stopCommand', [area.checkout, arg.name], area.stopCommand);
	handle('installPackages', [area.checkout], area.installPackages);
	handle('cancelInstall', [], area.cancelInstall);
};
