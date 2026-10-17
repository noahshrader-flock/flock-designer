import { createContext, useContext } from 'react';
import { DEFAULT_THEME, THEMES, type Theme, themeLabel } from '../../src/shared/prototypeTheme';
import type { MenuSection } from './ui/Menu';
import { ModeIcon } from './ui/ModeIcon';

/** The mode components are shown in, and choosing another: what a page's parts read (`useMode`), given where it starts (`useModeChoice`). */
export type Mode = [Theme, (mode: Theme) => void];

const ModeContext = createContext<Mode>([DEFAULT_THEME, () => undefined]);

export const ModeProvider = ModeContext.Provider;
export const useMode = (): Mode => useContext(ModeContext);

/**
 * Light and Dark as a section of the components' options (`ViewOptions`): Color mode, the sun or the moon at the start of each
 * and a check at the end of the one in use. The one place that says how the choice is offered; the choice itself is the
 * extension's (`useMode`).
 */
export const modeSection = (mode: Theme, onMode: (mode: Theme) => void): MenuSection => ({
	heading: 'Color mode',
	items: THEMES.map((value) => ({
		label: themeLabel(value),
		icon: <ModeIcon mode={value} />,
		checked: value === mode,
		onSelect: () => onMode(value),
	})),
});
