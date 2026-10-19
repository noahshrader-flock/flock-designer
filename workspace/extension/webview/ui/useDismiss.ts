import { type RefObject, useEffect, useRef } from 'react';

/** What is open over the panel (a dialog, a menu, a popover), in the order it opened: Escape is for the last. */
const opened: { close: () => void }[] = [];

/** The one Escape: it closes what opened last, and only that, unless what has the focus used it first (a search, clearing). */
const escape = (e: KeyboardEvent) => {
	const top = opened.at(-1);
	if (e.key !== 'Escape' || e.defaultPrevented || !top) return;
	e.preventDefault();
	top.close();
};

/** Closes it on Escape while it is `open` and nothing opened over it since. */
export const useEscape = (open: boolean, onClose: () => void): void => {
	// The latest `onClose`, so a new one each render does not take it off the stack and put it back on top.
	const close = useRef(onClose);
	close.current = onClose;
	useEffect(() => {
		if (!open) return;
		const entry = { close: () => close.current() };
		if (opened.length === 0) document.addEventListener('keydown', escape);
		opened.push(entry);
		return () => {
			opened.splice(opened.indexOf(entry), 1);
			if (opened.length === 0) document.removeEventListener('keydown', escape);
		};
	}, [open]);
};

/**
 * How what is drawn over the panel from a button of its own goes away, for a menu and a popover alike: Escape closes it
 * (`useEscape`) and the keyboard goes on from the button it opened from; a press anywhere outside `within` (the button and
 * what it opened) closes it, leaving the focus where the press put it.
 */
export const useDismiss = (
	open: boolean,
	within: RefObject<HTMLElement | null>,
	onClose: () => void,
	opener: RefObject<HTMLElement | null>,
): void => {
	useEscape(open, () => {
		onClose();
		opener.current?.focus();
	});
	// The latest `onClose`, so a new one each render does not take the listener off and put it on again.
	const close = useRef(onClose);
	close.current = onClose;
	useEffect(() => {
		if (!open) return;
		const outside = (e: MouseEvent) => !within.current?.contains(e.target as Node) && close.current();
		document.addEventListener('mousedown', outside);
		return () => document.removeEventListener('mousedown', outside);
	}, [open, within]);
};
