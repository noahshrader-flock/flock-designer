import { EllipsisVerticalIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Spinner } from './ui/spinner';

/**
 * The vertical-ellipsis More menu, the same wherever something has more to offer. `label` names it for a screen reader;
 * `busy` puts a spinner where the ellipsis is, while something from the menu runs; `icon-sm` is the size on a card.
 */
export const MoreMenu = ({
	label = 'More',
	busy = false,
	size = 'icon',
	disabled,
	className,
	children,
}: {
	label?: string;
	busy?: boolean;
	size?: 'icon' | 'icon-sm';
	disabled?: boolean;
	/** Where the trigger sits in what holds it. */
	className?: string;
	children: ReactNode;
}) => (
	<DropdownMenu>
		<DropdownMenuTrigger asChild>
			<Button size={size} variant="ghost" aria-label={label} disabled={disabled} className={className}>
				{busy ? <Spinner /> : <EllipsisVerticalIcon />}
			</Button>
		</DropdownMenuTrigger>
		<DropdownMenuContent align="end" className="w-auto">
			{children}
		</DropdownMenuContent>
	</DropdownMenu>
);
