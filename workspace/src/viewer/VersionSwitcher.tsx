import { MoonIcon, SunIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { newestVersionFirst } from '../shared/prototypeNames';
import { workLabel } from '../shared/work';
import { stateLabel } from '../shared/prototypeStates';
import { THEMES, isTheme, themeLabel } from '../shared/prototypeTheme';
import type { ShownTheme } from './useShownTheme';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { capitalize } from '../shared/titleCase';
import { ChoiceMenu } from './ChoiceMenu';
import type { BarSize } from './Toolbar';

/** What the switcher needs to know of a version: how it is named, which it is, and the version it was started from. */
export interface Switchable {
	name: string;
	branch: string;
	from?: string | undefined;
}

/**
 * One of the switcher's dropdowns: the app's menu of a few choices, named for what it switches ("Version 2: switch
 * version"), opening from its right, as the switcher sits at the toolbar's right.
 */
const SwitchMenu = ({
	what,
	label,
	...choice
}: {
	/** The bar's size, when it is a bar's. */
	size?: BarSize;
	/** What it picks, for its name for assistive technology: "version", "state". */
	what: 'version' | 'state';
	/** The button's own words: `Version 2`, `default`. */
	label: string;
	value: string;
	choices: { value: string; label: string }[];
	onChange: (value: string) => void;
}) => (
	<ChoiceMenu
		name={capitalize(what)}
		// Named once: a version's label says it is one ("Version 2: switch version"), a state's does not ("State Default").
		ariaLabel={`${label.startsWith(capitalize(what)) ? label : `${capitalize(what)} ${label}`}: switch ${what}`}
		label={label}
		align="end"
		{...choice}
	/>
);

/**
 * Switching between a prototype's versions, on its published page (and its review in VS Code, which frames that page): a
 * dropdown saying which version is shown, its menu the newest first, and after it the page's states.
 */
export const VersionSwitcher = <T extends Switchable>({
	current,
	siblings,
	onSelect,
	children,
	size = 'default',
}: {
	current: Switchable;
	siblings: T[];
	onSelect: (next: T) => void;
	/** A prototype's states, after the version, where they read left to right. */
	children?: ReactNode;
	/** The bar's size, for the dropdowns. */
	size?: BarSize;
}) => {
	// Newest first, whatever order they were given in: the app and the published page then always agree.
	const newestFirst = [...siblings].sort((a, b) => newestVersionFirst(a.name, b.name));
	return (
		<>
			<SwitchMenu
				size={size}
				what="version"
				label={workLabel(current)}
				value={current.branch}
				choices={newestFirst.map((i) => ({ value: i.branch, label: `${workLabel(i)}${i.from ? ` · based on ${workLabel({ name: i.from })}` : ''}` }))}
				onChange={(branch) => {
					const next = siblings.find((i) => i.branch === branch);
					if (next && branch !== current.branch) onSelect(next);
				}}
			/>
			{children}
		</>
	);
};

/**
 * A prototype's states (see `shared/prototypeStates`), as a dropdown that says the one shown, like the version beside it:
 * each is a way of seeing the page, and the list names them all. Not there with fewer than two, as there is nothing to
 * switch to. `null` is the first, the state the page opens in, so choosing it goes back to the page's own address.
 */
export const StateSwitcher = ({
	states,
	current,
	onSelect,
	size = 'default',
}: {
	states: string[];
	current: string | null;
	onSelect: (state: string | null) => void;
	size?: BarSize;
}) => {
	if (states.length < 2) return null;
	// One it no longer has (it was built again without it) shows as the page does: in the first.
	const here = current !== null && states.includes(current) ? current : (states[0] as string);
	return (
		<SwitchMenu
			size={size}
			what="state"
			label={stateLabel(here)}
			value={here}
			choices={states.map((s) => ({ value: s, label: stateLabel(s) }))}
			onChange={(next) => onSelect(next === states[0] ? null : next)}
		/>
	);
};

/**
 * Light and Dark, after the states: the prototype in either theme, whatever the machine is set to.
 * The one shown is pressed: light, the default, until the other is chosen.
 */
export const ThemeSwitcher = ({ shown, size = 'default' }: { shown: ShownTheme; size?: BarSize }) => (
	<ToggleGroup
		type="single"
		variant="outline"
		size={size}
		spacing={0}
		aria-label="Theme"
		value={shown.theme}
		onValueChange={(next) => isTheme(next) && next !== shown.theme && shown.onTheme(next)}
	>
		{THEMES.map((theme) => (
			<ToggleGroupItem key={theme} value={theme} aria-label={themeLabel(theme)} title={themeLabel(theme)}>
				{theme === 'dark' ? <MoonIcon /> : <SunIcon />}
			</ToggleGroupItem>
		))}
	</ToggleGroup>
);
