/**
 * How a dialog or sheet its screen opens is closed, by Escape, a click outside or its corner button: `onOpenChange`
 * gives it the screen's `onClose`, unless the dialog is working (`busy`), when closing it would lose what it is doing.
 * One way for every dialog, so none closes mid-work and none forgets to close.
 */
export const closeUnlessBusy =
	(onClose: () => void, busy = false) =>
	(open: boolean): void => {
		if (!open && !busy) onClose();
	};
