import type { LucideIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

/**
 * Where something is kept (the branch it is on, where a page is saved), as a small icon whose tooltip says it. The icon
 * sits in something that can take focus, so the tooltip opens from the keyboard as well as on hover; an icon alone cannot.
 */
export const LocationHint = ({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) => (
	<Tooltip>
		<TooltipTrigger asChild>
			<span
				tabIndex={0}
				role="img"
				aria-label={label}
				className="text-muted-foreground focus-visible:ring-ring/50 inline-flex shrink-0 rounded-sm outline-none focus-visible:ring-[3px]"
			>
				<Icon aria-hidden className="size-4" />
			</span>
		</TooltipTrigger>
		<TooltipContent side="bottom" className="font-mono">
			{value}
		</TooltipContent>
	</Tooltip>
);
