import { THEMES, type Theme, themeLabel } from '../../src/shared/prototypeTheme';
import type { MenuSection } from '../../src/ui/Menu';
import { ModeIcon } from '../../src/ui/ModeIcon';

export const modeSection = (mode: Theme, onMode: (mode: Theme) => void): MenuSection => ({
	heading: 'Color mode',
	items: THEMES.map((value) => ({
		label: themeLabel(value),
		icon: <ModeIcon mode={value} />,
		checked: value === mode,
		onSelect: () => onMode(value),
	})),
});
