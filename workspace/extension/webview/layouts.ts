import type { MenuSection } from '../../src/ui/Menu';
import type { View } from '../../src/ui/Collection';

const LAYOUTS = [
	{ value: 'grid', label: 'Grid', icon: 'layout' },
	{ value: 'list', label: 'List', icon: 'list-unordered' },
] as const satisfies { value: View; label: string; icon: string }[];

export const layoutSection = (view: View, onView: (view: View) => void): MenuSection => ({
	heading: 'Layout',
	items: LAYOUTS.map(({ value, label, icon }) => ({ label, icon, checked: value === view, onSelect: () => onView(value) })),
});
