import { useState } from 'react';
import { DEFAULT_THEME, type Theme } from '../shared/prototypeTheme';

export interface ShownTheme {
	theme: Theme;
	onTheme: (theme: Theme) => void;
}

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
