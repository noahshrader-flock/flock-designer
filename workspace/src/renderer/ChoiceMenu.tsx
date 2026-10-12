import { ChevronDownIcon } from 'lucide-react';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from './ui/dropdown-menu';

/**
 * One of a few choices, on a toolbar: an outline button that says the one chosen, and a menu of all of them with that one
 * checked. Named for a screen reader as what it chooses and the choice (`Sort projects: Last updated`).
 */
export const ChoiceMenu = <T extends string>({
	name,
	value,
	choices,
	onChange,
}: {
	name: string;
	value: T;
	choices: { value: T; label: string }[];
	onChange: (value: T) => void;
}) => {
	const label = choices.find((c) => c.value === value)?.label ?? '';
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" aria-label={`${name}: ${label}`}>
					{label}
					<ChevronDownIcon />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-auto">
				<DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as T)}>
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
