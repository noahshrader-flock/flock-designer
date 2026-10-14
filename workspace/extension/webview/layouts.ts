import type { MenuSection } from './ui/Menu';
import type { View } from './vscode';

/** The two ways to see a list of things with pictures, as the app has them: a grid of cards, which it starts in, or rows. */
export const LAYOUTS = [
	{ value: 'grid', label: 'Grid', icon: 'layout' },
	{ value: 'list', label: 'List', icon: 'list-unordered' },
] as const satisfies { value: View; label: string; icon: string }[];

/**
 * Grid and List as a section of a view's options (`ViewOptions`): Layout, an icon at the start of each and a check at the
 * end of the one in use. The one place that says what the layouts are, for every tab that has them.
 */
export const layoutSection = (view: View, onView: (view: View) => void): MenuSection => ({
	heading: 'Layout',
	items: LAYOUTS.map(({ value, label, icon }) => ({ label, icon, checked: value === view, onSelect: () => onView(value) })),
});
