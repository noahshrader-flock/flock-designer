import { useState } from 'react';
import { DEFAULT_THEME, type Theme } from '../shared/prototypeTheme';

/** The theme a prototype is shown in, in a review bar: light until the other is chosen. */
export interface ShownTheme {
	theme: Theme;
	onTheme: (theme: Theme) => void;
}

/** A bar's theme: `onChosen` is told each one chosen, to show the page in it (`withTheme`). */
export const useShownTheme = (onChosen?: (theme: Theme) => void): ShownTheme => {
	const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
	return {
		theme,
		onTheme: (next) => {
			setTheme(next);
			onChosen?.(next);
		},
	};
};
