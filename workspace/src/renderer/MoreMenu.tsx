import { EllipsisVerticalIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

/** The vertical-ellipsis More menu, the same wherever something has more to offer. `label` names it for a screen reader. */
export const MoreMenu = ({ label = 'More', children }: { label?: string; children: ReactNode }) => (
	<DropdownMenu>
		<Tooltip>
			<TooltipTrigger asChild>
				<DropdownMenuTrigger asChild>
					<Button size="icon" variant="ghost" aria-label={label}>
						<EllipsisVerticalIcon />
					</Button>
				</DropdownMenuTrigger>
			</TooltipTrigger>
			<TooltipContent>More</TooltipContent>
		</Tooltip>
		<DropdownMenuContent align="end" className="w-auto">
			{children}
		</DropdownMenuContent>
	</DropdownMenu>
);
