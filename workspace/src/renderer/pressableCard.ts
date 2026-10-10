import type { KeyboardEvent } from 'react';

/** How a card that is pressed looks: lighter under the pointer, and a ring when it has the keyboard's focus. */
export const PRESSABLE_CARD = 'hover:bg-accent/40 focus-visible:ring-ring/50 cursor-pointer transition-colors outline-none focus-visible:ring-3';

/**
 * What makes a whole card one control, the same for every grid of cards (projects, components): a button or a link by
 * name, reached by Tab, pressed by a click or by Enter or Space.
 */
export const pressableCard = (label: string, onPress: () => void, role: 'button' | 'link' = 'button') => ({
	role,
	tabIndex: 0,
	'aria-label': label,
	onClick: onPress,
	onKeyDown: (e: KeyboardEvent) => {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		e.preventDefault();
		onPress();
	},
});
