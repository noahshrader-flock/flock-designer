import { newestVersionFirst } from '../shared/prototypeNames';
import { workLabel } from '../shared/work';
import { stateLabel } from '../shared/prototypeStates';
import { THEMES, themeLabel } from '../shared/prototypeTheme';
import type { ShownTheme } from './useShownTheme';
import { capitalize } from '../shared/titleCase';
import { Dropdown } from '../ui/Dropdown';
import { ModeIcon } from '../ui/ModeIcon';
import { Toggle } from '../ui/Toggle';

export interface Switchable {
	name: string;
	branch: string;
	from?: string | undefined;
}

const SwitchMenu = ({
	what,
	label,
	value,
	choices,
	onChange,
}: {
	what: 'version' | 'state';
	label: string;
	value: string;
	choices: { value: string; label: string }[];
	onChange: (value: string) => void;
}) => {
	// A version's label already says it is one ("Version 2: switch version"); a state's does not ("State Default").
	const name = `${label.startsWith(capitalize(what)) ? label : `${capitalize(what)} ${label}`}: switch ${what}`;
	return <Dropdown label={name} value={value} options={choices} onChange={onChange} />;
};

/** What is chosen is given back as it was given (`T`: with where its page is). */
export const VersionSwitcher = <T extends Switchable>({
	current,
	siblings,
	onSelect,
}: {
	current: Switchable;
	siblings: T[];
	onSelect: (next: T) => void;
}) => {
	const newestFirst = [...siblings].sort((a, b) => newestVersionFirst(a.name, b.name));
	return (
		<SwitchMenu
			what="version"
			label={workLabel(current)}
			value={current.branch}
			choices={newestFirst.map((i) => ({ value: i.branch, label: `${workLabel(i)}${i.from ? ` · based on ${workLabel({ name: i.from })}` : ''}` }))}
			onChange={(branch) => {
				const next = siblings.find((i) => i.branch === branch);
				if (next) onSelect(next);
			}}
		/>
	);
};

/** `null` is the first state, the one the page opens in, so choosing it goes back to the page's own address. */
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

export const ThemeSwitcher = ({ shown }: { shown: ShownTheme }) => (
	<Toggle
		label="Theme"
		iconOnly
		options={THEMES.map((theme) => ({ value: theme, label: themeLabel(theme), icon: <ModeIcon mode={theme} /> }))}
		value={shown.theme}
		onChange={(next) => next !== shown.theme && shown.onTheme(next)}
	/>
);
