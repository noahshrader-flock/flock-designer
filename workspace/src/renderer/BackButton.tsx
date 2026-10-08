import { ChevronLeftIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

/** The way back from a screen opened from a list, at the start of its header: a chevron, named by its tooltip. */
export const BackButton = ({ label, onClick, className = '' }: { label: string; onClick: () => void; className?: string }) => (
	<Tooltip>
		<TooltipTrigger asChild>
			<Button size="icon" variant="ghost" aria-label={label} className={className} onClick={onClick}>
				<ChevronLeftIcon />
			</Button>
		</TooltipTrigger>
		<TooltipContent side="bottom">{label}</TooltipContent>
	</Tooltip>
);
