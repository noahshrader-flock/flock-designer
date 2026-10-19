import { type ReactNode, useId } from 'react';
import { newestVersionFirst } from '../shared/prototypeNames';
import { workLabel } from '../shared/work';
import { stateLabel } from '../shared/prototypeStates';
import { THEMES, themeLabel } from '../shared/prototypeTheme';
import type { ShownTheme } from './useShownTheme';
import { capitalize } from '../shared/titleCase';
import { Select } from '../ui/Field';
import { ModeIcon } from '../ui/ModeIcon';
import { Toggle } from '../ui/Toggle';

/** What the switcher needs to know of a version: how it is named, which it is, and the version it was started from. */
export interface Switchable {
	name: string;
	branch: string;
	from?: string | undefined;
}

/**
 * One of the switcher's dropdowns: VS Code's own (`Select`), saying the one shown, named for what it switches ("Version 2:
 * switch version"). Choosing the one shown does nothing.
 */
const SwitchMenu = ({
	what,
	label,
	value,
	choices,
	onChange,
}: {
	/** What it picks, for its name for assistive technology: "version", "state". */
	what: 'version' | 'state';
	/** What it says it shows: `Version 2`, `Default`. */
	label: string;
	value: string;
	choices: { value: string; label: string }[];
	onChange: (value: string) => void;
}) => {
	const id = useId();
	// Named once: a version's label says it is one ("Version 2: switch version"), a state's does not ("State Default").
	const name = `${label.startsWith(capitalize(what)) ? label : `${capitalize(what)} ${label}`}: switch ${what}`;
	return <Select value={value} options={choices} onChange={(next) => next !== value && onChange(next)} control={{ id, 'aria-label': name }} />;
};

/**
 * Switching between a prototype's versions, on its published page (and its review in VS Code, which frames that page): a
 * dropdown saying which version is shown, its list the newest first, and after it the page's states.
 */
export const VersionSwitcher = <T extends Switchable>({
	current,
	siblings,
	onSelect,
	children,
}: {
	current: Switchable;
	siblings: T[];
	onSelect: (next: T) => void;
	/** A prototype's states, after the version, where they read left to right. */
	children?: ReactNode;
}) => {
	// Newest first, whatever order they were given in: the app and the published page then always agree.
	const newestFirst = [...siblings].sort((a, b) => newestVersionFirst(a.name, b.name));
	return (
		<>
			<SwitchMenu
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
}: {
	states: string[];
	current: string | null;
	onSelect: (state: string | null) => void;
}) => {
	if (states.length < 2) return null;
	// One it no longer has (it was built again without it) shows as the page does: in the first.
	const here = current !== null && states.includes(current) ? current : (states[0] as string);
	return (
		<SwitchMenu
			what="state"
			label={stateLabel(here)}
			value={here}
			choices={states.map((s) => ({ value: s, label: stateLabel(s) }))}
			onChange={(next) => onSelect(next === states[0] ? null : next)}
		/>
	);
};

/**
 * Light and Dark, after the states: the prototype in either theme, whatever the machine is set to, as the kit's toggle of
 * the sun and the moon. The one shown is chosen: light, the default, until the other is.
 */
export const ThemeSwitcher = ({ shown }: { shown: ShownTheme }) => (
	<Toggle
		label="Theme"
		iconOnly
		options={THEMES.map((theme) => ({ value: theme, label: themeLabel(theme), icon: <ModeIcon mode={theme} /> }))}
		value={shown.theme}
		onChange={(next) => next !== shown.theme && shown.onTheme(next)}
	/>
);
