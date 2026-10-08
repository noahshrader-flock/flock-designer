import { ChevronDownIcon } from 'lucide-react';
import { byVersion, iterationLabel, parsePrototypeName } from '../shared/projects';
import { Button } from './ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

/** What the switcher needs to know of an iteration: how it is named, and which it is. */
export interface Switchable {
	name: string;
	branch: string;
}

/**
 * Switching between a project's iterations: the button that says which one this is, and the menu of the others. One
 * component, so the app's review screen and a prototype's published page carry the same one.
 *
 * Prototypes are listed by version, then their iterations (`grouped`); codebase work is one list. It is shown even with
 * one iteration, so where you are, and that there can be more, is always visible.
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
	grouped: boolean;
	onSelect: (next: T) => void;
	/** Said after an iteration's name in the menu, when there is something to say about it. */
	note?: (iteration: T) => string;
}) => (
	<DropdownMenu>
		<Tooltip>
			<TooltipTrigger asChild>
				<DropdownMenuTrigger asChild>
					<Button size="sm" variant="outline" aria-label={`Iteration ${iterationLabel(current)}: switch iteration`}>
						{iterationLabel(current)}
						<ChevronDownIcon />
					</Button>
				</DropdownMenuTrigger>
			</TooltipTrigger>
			<TooltipContent>Switch iteration</TooltipContent>
		</Tooltip>
		<DropdownMenuContent align="end" className="w-auto">
			<DropdownMenuRadioGroup
				value={current.branch}
				onValueChange={(branch) => {
					const next = siblings.find((i) => i.branch === branch);
					if (next && branch !== current.branch) onSelect(next);
				}}
			>
				{grouped
					? byVersion(siblings).map((group, n) => (
							<DropdownMenuGroup key={group.version}>
								{n > 0 && <DropdownMenuSeparator />}
								<DropdownMenuLabel className="text-muted-foreground text-xs">V{group.version}</DropdownMenuLabel>
								{group.iterations.map((i) => (
									<DropdownMenuRadioItem key={i.branch} value={i.branch}>
										I{parsePrototypeName(i.name)?.iteration}
										{note?.(i) ?? ''}
									</DropdownMenuRadioItem>
								))}
							</DropdownMenuGroup>
						))
					: siblings.map((i) => (
							<DropdownMenuRadioItem key={i.branch} value={i.branch}>
								{iterationLabel(i)}
								{note?.(i) ?? ''}
							</DropdownMenuRadioItem>
						))}
			</DropdownMenuRadioGroup>
		</DropdownMenuContent>
	</DropdownMenu>
);
