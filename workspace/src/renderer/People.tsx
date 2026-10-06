import type { Person } from '../shared/contract';
import { avatarUrl } from '../shared/people';
import { Avatar, AvatarFallback, AvatarGroup, AvatarImage } from './ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

/** Profile picture and username for each person; initials stand in when no GitHub account is known. */
export const People = ({ people, empty }: { people: Person[]; empty?: string }) =>
	people.length === 0 ? (
		empty ? (
			<p className="text-muted-foreground text-sm">{empty}</p>
		) : null
	) : (
		<div className="flex flex-row flex-wrap gap-4">
			{people.map((p) => (
				<div key={p.login ?? p.name} className="flex flex-row items-center gap-2">
					<Avatar size="sm" className="data-[size=sm]:size-5">
						<AvatarImage src={avatarUrl(p.login) ?? undefined} alt={p.name} />
						<AvatarFallback>{p.name.charAt(0).toUpperCase()}</AvatarFallback>
					</Avatar>
					<span className="text-sm">{p.login ?? p.name}</span>
				</div>
			))}
		</div>
	);

/**
 * Just the pictures, for where a name would crowd: overlapping, each with its name on hover so who it is is
 * never lost with the words.
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
