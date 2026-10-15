import { ChevronDownIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { type BarSize, barButtonSize } from './Toolbar';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from './ui/dropdown-menu';

/**
 * One of a few choices: an outline button that says the one chosen (or an icon, when the menu says it), and a menu of all
 * of them with that one checked, which scrolls when it is long. Choosing the one chosen does nothing. Named for a screen
 * reader as what it chooses and the choice (`Sort projects: Last updated`), unless it says so itself (`ariaLabel`).
 */
export const ChoiceMenu = <T extends string>({
	name,
	value,
	choices,
	onChange,
	label,
	icon,
	align = 'start',
	ariaLabel,
	size = 'default',
}: {
	name: string;
	value: T;
	choices: { value: T; label: string }[];
	onChange: (value: T) => void;
	/** The button's own words, when they are not the choice's label (`V2`). */
	label?: string;
	/** Drawn instead of the words, which are then only in its name for assistive technology. */
	icon?: ReactNode;
	align?: 'start' | 'end';
	ariaLabel?: string;
	/** The bar's size, when it is a bar's: small over a page. */
	size?: BarSize;
}) => {
	const words = label ?? choices.find((c) => c.value === value)?.label ?? '';
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size={barButtonSize(size, Boolean(icon))} aria-label={ariaLabel ?? `${name}: ${words}`}>
					{icon ?? (
						<>
							{words}
							<ChevronDownIcon />
						</>
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align={align} className="max-h-72 w-auto">
				<DropdownMenuRadioGroup value={value} onValueChange={(next) => next !== value && onChange(next as T)}>
					{choices.map((c) => (
						<DropdownMenuRadioItem key={c.value} value={c.value}>
							{c.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
