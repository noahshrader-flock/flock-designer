import { ChevronsUpDownIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

/**
 * A dropdown you can search by typing: shadcn's combobox recipe, a Popover holding a Command list.
 *
 * Built from Radix pieces rather than shadcn's newer Base UI Combobox on purpose: that one opens its list
 * outside a Radix dialog, which then refuses every click on it, so nothing in the list could be picked.
 */
export const SearchSelect = ({
	id,
	items,
	value,
	onChange,
	placeholder,
	search,
	empty,
	disabled,
	className,
}: {
	id?: string;
	items: string[];
	value: string | null;
	onChange: (value: string) => void;
	placeholder: string;
	search: string;
	empty: string;
	disabled?: boolean;
	className?: string;
}) => {
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					id={id}
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className={cn('w-full justify-between font-normal', className)}
				>
					<span className={cn('truncate', !value && 'text-muted-foreground')}>{value ?? placeholder}</span>
					<ChevronsUpDownIcon className="opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className={cn('w-(--radix-popover-trigger-width) p-0', className)} align="start">
				<Command>
					<CommandInput placeholder={search} />
					<CommandList>
						<CommandEmpty>{empty}</CommandEmpty>
						<CommandGroup>
							{items.map((item) => (
								<CommandItem
									key={item}
									value={item}
									data-checked={value === item}
									onSelect={() => {
										onChange(item);
										setOpen(false);
									}}
								>
									<span className="truncate">{item}</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
};
