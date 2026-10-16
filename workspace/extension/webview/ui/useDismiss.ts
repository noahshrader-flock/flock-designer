import { type RefObject, useEffect, useRef } from 'react';

/**
 * How what is drawn over the panel from a button of its own goes away, for a menu and a popover alike: Escape closes it and
 * the keyboard goes on from the button it opened from; a press anywhere outside `within` (the button and what it opened)
 * closes it, leaving the focus where the press put it.
 */
export const useDismiss = (
	open: boolean,
	within: RefObject<HTMLElement | null>,
	onClose: () => void,
	opener: RefObject<HTMLElement | null>,
): void => {
	// The latest `onClose`, so a new one each render does not take the listeners off and put them on again.
	const close = useRef(onClose);
	close.current = onClose;
	useEffect(() => {
		if (!open) return;
		const escape = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			close.current();
			opener.current?.focus();
		};
		const outside = (e: MouseEvent) => !within.current?.contains(e.target as Node) && close.current();
		document.addEventListener('keydown', escape);
		document.addEventListener('mousedown', outside);
		return () => {
			document.removeEventListener('keydown', escape);
			document.removeEventListener('mousedown', outside);
		};
	}, [open, within, opener]);
};
