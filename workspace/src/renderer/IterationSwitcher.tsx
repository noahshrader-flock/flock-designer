import { ChevronDownIcon, HistoryIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { byVersion, iterationLabel, latestIterationName, parsePrototypeName } from '../shared/projects';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

/** What the switcher needs to know of an iteration: how it is named, and which it is. */
export interface Switchable {
	name: string;
	branch: string;
}

/**
 * One dropdown: a button that says where you are (or an icon, when the menu says it), and the menu of the choices, with
 * this one checked. A long menu scrolls.
 */
const Pick = ({
	what,
	label,
	value,
	choices,
	onChange,
	icon,
	tip = `Switch ${what}`,
}: {
	/** What it picks, for its tooltip and its name for assistive technology: "version", "iteration", "state". */
	what: 'version' | 'iteration' | 'state';
	/** The button's own words: `V2`, `I1`, `default`. */
	label: string;
	value: string;
	choices: { value: string; label: string }[];
	onChange: (value: string) => void;
	/** Drawn instead of the label, which is then only in its name for assistive technology. */
	icon?: ReactNode;
	tip?: string;
}) => (
	<DropdownMenu>
		<Tooltip>
			<TooltipTrigger asChild>
				<DropdownMenuTrigger asChild>
					<Button variant="outline" size={icon ? 'icon' : 'default'} aria-label={`${what[0]!.toUpperCase()}${what.slice(1)} ${label}: switch ${what}`}>
						{icon ?? (
							<>
								{label}
								<ChevronDownIcon />
							</>
						)}
					</Button>
				</DropdownMenuTrigger>
			</TooltipTrigger>
			<TooltipContent>{tip}</TooltipContent>
		</Tooltip>
		<DropdownMenuContent align="end" className="max-h-72 w-auto">
			<DropdownMenuRadioGroup value={value} onValueChange={(next) => next !== value && onChange(next)}>
				{choices.map((c) => (
					<DropdownMenuRadioItem key={c.value} value={c.value}>
						{c.label}
					</DropdownMenuRadioItem>
				))}
			</DropdownMenuRadioGroup>
		</DropdownMenuContent>
	</DropdownMenu>
);

/** The iteration is picked from its history: a clock icon, the menu newest first with the one shown checked. */
const HISTORY = { icon: <HistoryIcon />, tip: 'History' };

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
}: {
	current: Switchable;
	siblings: T[];
	/** Prototypes: a dropdown for versions and one for iterations. Codebase work: one list. */
	grouped: boolean;
	onSelect: (next: T) => void;
	/** Said after an iteration's name in the menu, when there is something to say about it. */
	note?: (iteration: T) => string;
}) => {
	const go = (branch: string) => {
		const next = siblings.find((i) => i.branch === branch);
		if (next && branch !== current.branch) onSelect(next);
	};
	const here = parsePrototypeName(current.name);
	if (!grouped || here === null) {
		return (
			<Pick
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
		.map((v) => ({ ...v, iterations: [...v.iterations].sort((a, b) => (parsePrototypeName(b.name)?.iteration ?? 0) - (parsePrototypeName(a.name)?.iteration ?? 0)) }))
		.sort((a, b) => b.version - a.version);
	return (
		<>
			<Pick
				what="version"
				label={`V${here.version}`}
				value={String(here.version)}
				choices={versions.map((v) => ({ value: String(v.version), label: `V${v.version}` }))}
				// A version opens at its newest iteration.
				onChange={(v) => {
					const newest = latestIterationName(siblings.map((i) => i.name), Number(v));
					const next = siblings.find((i) => i.name === newest);
					if (next) go(next.branch);
				}}
			/>
			<Pick
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
 * A prototype's states (see `shared/prototypeStates`): beside the version and the iteration, the way of seeing this one
 * that is on screen. Not there with fewer than two, as there is nothing to switch to. `null` is the first, the state
 * the page opens in, so choosing it goes back to the page's own address.
 */
export const StateSwitcher = ({ states, current, onSelect }: { states: string[]; current: string | null; onSelect: (state: string | null) => void }) => {
	if (states.length < 2) return null;
	// One it no longer has (it was built again without it) shows as the page does: in the first.
	const here = current !== null && states.includes(current) ? current : (states[0] as string);
	return (
		<Pick
			what="state"
			label={here}
			value={here}
			choices={states.map((s) => ({ value: s, label: s }))}
			onChange={(s) => onSelect(s === states[0] ? null : s)}
		/>
	);
};
