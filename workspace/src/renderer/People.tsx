import type { Person } from '../shared/contract';
import { avatarUrl } from '../shared/people';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

/**
 * Who a project is by: the first person's picture and name, and how many others there are, whose names are on hover. The
 * first person is the one the project's record names first, who started it.
 */
export const PeopleLine = ({ people }: { people: Person[] }) => {
	const [first, ...others] = people;
	if (first === undefined) return null;
	return (
		<span className="flex min-w-0 items-center gap-2">
			<Avatar size="xs">
				<AvatarImage src={avatarUrl(first.login) ?? undefined} alt="" />
				<AvatarFallback>{first.name.charAt(0).toUpperCase()}</AvatarFallback>
			</Avatar>
			<span className="truncate text-sm">{first.name}</span>
			{others.length > 0 && (
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="text-muted-foreground text-xs">+{others.length}</span>
					</TooltipTrigger>
					<TooltipContent>{others.map((p) => p.name).join(', ')}</TooltipContent>
				</Tooltip>
			)}
		</span>
	);
};
