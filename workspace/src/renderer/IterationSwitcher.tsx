import { HistoryIcon, MoonIcon, SunIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { byVersion, latestIterationName, parsePrototypeName } from '../shared/prototypeNames';
import { iterationLabel } from '../shared/work';
import { stateLabel } from '../shared/prototypeStates';
import { isTheme } from '../shared/prototypeTheme';
import type { ShownTheme } from './useShownTheme';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { capitalize } from '../shared/titleCase';
import { ChoiceMenu } from './ChoiceMenu';

/** What the switcher needs to know of an iteration: how it is named, and which it is. */
export interface Switchable {
	name: string;
	branch: string;
}

/**
 * One of the switcher's dropdowns: the app's menu of a few choices, named for what it switches ("Version V2: switch
 * version"), opening from its right, as the switcher sits at the toolbar's right.
 */
const SwitchMenu = ({
	what,
	label,
	...choice
}: {
	/** What it picks, for its name for assistive technology: "version", "iteration", "state". */
	what: 'version' | 'iteration' | 'state';
	/** The button's own words: `V2`, `I1`, `default`. */
	label: string;
	value: string;
	choices: { value: string; label: string }[];
	onChange: (value: string) => void;
	/** Drawn instead of the label, which is then only in its name for assistive technology. */
	icon?: ReactNode;
}) => <ChoiceMenu name={capitalize(what)} ariaLabel={`${capitalize(what)} ${label}: switch ${what}`} label={label} align="end" {...choice} />;

/** The iteration is picked from its history: a clock icon, the menu newest first with the one shown checked. */
const HISTORY = { icon: <HistoryIcon /> };

/**
 * Switching between a project's work. Prototypes have two, as they have two ideas of "another": **the version** (a
 * different idea; going to one opens its newest iteration), a dropdown saying which, and beside it **the iteration** (a
 * refinement, among those of the version you are on), a history button whose menu has them newest first. Codebase work
 * is the history button alone. Both are shown even with one of each, so that there can be more is always visible. One
 * component, so the app's review screen and a prototype's published page carry the same ones.
 */
export const IterationSwitcher = <T extends Switchable>({
	current,
	siblings,
	grouped,
	onSelect,
	note,
	children,
}: {
	current: Switchable;
	siblings: T[];
	/** Prototypes: a dropdown for versions and one for iterations. Codebase work: one list. */
	grouped: boolean;
	onSelect: (next: T) => void;
	/** Said after an iteration's name in the menu, when there is something to say about it. */
	note?: (iteration: T) => string;
	/** A prototype's own controls (its states), between the version and the history, where they read left to right. */
	children?: ReactNode;
}) => {
	const go = (branch: string) => {
		const next = siblings.find((i) => i.branch === branch);
		if (next && branch !== current.branch) onSelect(next);
	};
	const here = parsePrototypeName(current.name);
	if (!grouped || here === null) {
		return (
			<SwitchMenu
				what="iteration"
				{...HISTORY}
				label={iterationLabel(current)}
				value={current.branch}
				choices={siblings.map((i) => ({ value: i.branch, label: `${iterationLabel(i)}${note?.(i) ?? ''}` }))}
				onChange={go}
			/>
		);
	}
	// Newest first, whatever order they were given in: the app and the published page then always agree.
	const versions = byVersion(siblings)
		.map((v) => ({
			...v,
			iterations: [...v.iterations].sort((a, b) => (parsePrototypeName(b.name)?.iteration ?? 0) - (parsePrototypeName(a.name)?.iteration ?? 0)),
		}))
		.sort((a, b) => b.version - a.version);
	return (
		<>
			<SwitchMenu
				what="version"
				label={`V${here.version}`}
				value={String(here.version)}
				choices={versions.map((v) => ({ value: String(v.version), label: `V${v.version}` }))}
				// A version opens at its newest iteration.
				onChange={(v) => {
					const newest = latestIterationName(
						siblings.map((i) => i.name),
						Number(v),
					);
					const next = siblings.find((i) => i.name === newest);
					if (next) go(next.branch);
				}}
			/>
			{children}
			<SwitchMenu
				what="iteration"
				{...HISTORY}
				label={`I${here.iteration}`}
				value={current.branch}
				choices={(versions.find((v) => v.version === here.version)?.iterations ?? []).map((i) => ({
					value: i.branch,
					label: `I${parsePrototypeName(i.name)?.iteration}${note?.(i) ?? ''}`,
				}))}
				onChange={go}
			/>
		</>
	);
};

/**
 * A prototype's states (see `shared/prototypeStates`), as a group of buttons with the one shown pressed: they are few,
 * and each is a way of seeing the page, so each is one press away. Not there with fewer than two, as there is nothing
 * to switch to. `null` is the first, the state the page opens in, so choosing it goes back to the page's own address.
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
		<ToggleGroup
			type="single"
			variant="outline"
			spacing={0}
			aria-label="State"
			value={here}
			// Pressing the one shown would unpress it, leaving none shown: it stays.
			onValueChange={(next) => next !== '' && next !== here && onSelect(next === states[0] ? null : next)}
		>
			{states.map((s) => (
				<ToggleGroupItem key={s} value={s}>
					{stateLabel(s)}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
};

/**
 * Light and Dark, beside the states (PROTOTYPE_THEME_PLAN): the prototype in either theme, whatever the machine is set to.
 * The one shown is pressed: the system's until one is chosen.
 */
export const ThemeSwitcher = ({ shown }: { shown: ShownTheme }) => (
	<ToggleGroup
		type="single"
		variant="outline"
		spacing={0}
		aria-label="Theme"
		value={shown.theme}
		onValueChange={(next) => isTheme(next) && next !== shown.theme && shown.onTheme(next)}
	>
		<ToggleGroupItem value="light" aria-label="Light" title="Light">
			<SunIcon />
		</ToggleGroupItem>
		<ToggleGroupItem value="dark" aria-label="Dark" title="Dark">
			<MoonIcon />
		</ToggleGroupItem>
	</ToggleGroup>
);
