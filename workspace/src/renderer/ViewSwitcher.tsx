import { LayoutGridIcon, LayoutListIcon } from 'lucide-react';
import { useState } from 'react';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';

/** A set of things as a list of rows, or a grid of cards: the same two ways on the Projects screen and the Design System. */
export type View = 'list' | 'grid';

/**
 * List or Grid, as a button group with the one shown pressed. The same switch wherever a screen has both, so it looks and
 * works the same: one is always pressed, and pressing it again does nothing.
 */
export const ViewSwitcher = ({ view, onSelect }: { view: View; onSelect: (view: View) => void }) => (
	<ToggleGroup
		type="single"
		variant="outline"
		spacing={0}
		aria-label="View"
		value={view}
		// Pressing the one shown would unpress it, which the group says as an empty value: ignored, so one stays pressed.
		onValueChange={(next) => (next === 'list' || next === 'grid') && onSelect(next)}
	>
		<ToggleGroupItem value="list" aria-label="List">
			<LayoutListIcon />
		</ToggleGroupItem>
		<ToggleGroupItem value="grid" aria-label="Grid">
			<LayoutGridIcon />
		</ToggleGroupItem>
	</ToggleGroup>
);

/**
 * The view a screen is in, as last chosen there: kept under `key` in the window's own storage, so each screen remembers
 * its own and one's choice never changes another's. The view the screen starts in (`first`) until one is chosen, or if what
 * is kept is not a view.
 */
export const useRememberedView = (key: string, first: View = 'list'): [View, (view: View) => void] => {
	const [view, setView] = useState<View>(() => {
		const kept = localStorage.getItem(key);
		return kept === 'list' || kept === 'grid' ? kept : first;
	});
	return [
		view,
		(next) => {
			setView(next);
			localStorage.setItem(key, next);
		},
	];
};
