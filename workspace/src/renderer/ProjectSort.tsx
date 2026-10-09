import { ChevronDownIcon } from 'lucide-react';
import type { ProjectOrder } from '../shared/projects';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

const ORDERS: { order: ProjectOrder; label: string }[] = [
	{ order: 'updated', label: 'Last updated' },
	{ order: 'alphabetical', label: 'Alphabetical' },
];

/** How the Projects screen orders its cards: the button says which, and the menu has the others. */
export const ProjectSort = ({ order, onChange }: { order: ProjectOrder; onChange: (order: ProjectOrder) => void }) => {
	const label = ORDERS.find((o) => o.order === order)?.label ?? '';
	return (
		<DropdownMenu>
			<Tooltip>
				<TooltipTrigger asChild>
					<DropdownMenuTrigger asChild>
						<Button size="sm" variant="outline" aria-label={`Sort projects: ${label}`}>
							{label}
							<ChevronDownIcon />
						</Button>
					</DropdownMenuTrigger>
				</TooltipTrigger>
				<TooltipContent>Sort projects</TooltipContent>
			</Tooltip>
			<DropdownMenuContent align="start" className="w-auto">
				<DropdownMenuRadioGroup value={order} onValueChange={(value) => onChange(value as ProjectOrder)}>
					{ORDERS.map((o) => (
						<DropdownMenuRadioItem key={o.order} value={o.order}>
							{o.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
