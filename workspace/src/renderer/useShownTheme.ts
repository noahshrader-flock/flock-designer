import { useState } from 'react';
import type { Theme } from '../shared/prototypeTheme';

/**
 * The theme a prototype is shown in, in a review bar (PROTOTYPE_THEME_PLAN): the system's until the person chooses one,
 * then theirs. `onTheme` chooses; the bar puts it in the page's address (`withTheme`).
 */
export interface ShownTheme {
	/** What is shown: the one chosen, else the system's. */
	theme: Theme;
	/** The one chosen; null until one is, when the page follows the system as the product does. */
	chosen: Theme | null;
	onTheme: (theme: Theme) => void;
}

/** The system's light or dark setting, as the page sees it when it is asked for no theme. */
export const systemTheme = (): Theme =>
	typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
		? 'dark'
		: 'light';

/** A bar's theme: `onChosen` is told each one chosen, to show the page in it. */
export const useShownTheme = (onChosen?: (theme: Theme) => void): ShownTheme => {
	const [chosen, setChosen] = useState<Theme | null>(null);
	return {
		theme: chosen ?? systemTheme(),
		chosen,
		onTheme: (theme) => {
			setChosen(theme);
			onChosen?.(theme);
		},
	};
};
