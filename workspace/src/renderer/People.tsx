import type { Person } from '../shared/contract';
import { avatarUrl } from '../shared/people';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';

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
					<Avatar size="sm">
						<AvatarImage src={avatarUrl(p.login) ?? undefined} alt={p.name} />
						<AvatarFallback>{p.name.charAt(0).toUpperCase()}</AvatarFallback>
					</Avatar>
					<span className="text-sm">{p.login ?? p.name}</span>
				</div>
			))}
		</div>
	);
