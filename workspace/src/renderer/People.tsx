import type { Person } from '../shared/contract';
import { avatarUrl } from '../shared/people';
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from './ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

/**
 * Each person as their picture, overlapping, with their name on hover, so who it is is never lost for the
 * want of words.
 */
export const PeopleAvatars = ({ people, className }: { people: Person[]; className?: string }) =>
	people.length === 0 ? null : (
		<AvatarGroup className={className}>
			{people.map((p) => (
				<Tooltip key={p.login ?? p.name}>
					<TooltipTrigger asChild>
						{/* The ring is set here: a tooltip trigger replaces the avatar's own slot name, which the group's ring rule keys off. */}
						<Avatar size="sm" className="ring-background ring-2 data-[size=sm]:size-5">
							<AvatarImage src={avatarUrl(p.login) ?? undefined} alt={p.name} />
							<AvatarFallback>{p.name.charAt(0).toUpperCase()}</AvatarFallback>
						</Avatar>
					</TooltipTrigger>
					<TooltipContent>{p.login ?? p.name}</TooltipContent>
				</Tooltip>
			))}
		</AvatarGroup>
	);
