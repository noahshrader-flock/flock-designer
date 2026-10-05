import { FSAvatar, FSStack, FSTypography } from '@flocksafety/flock-react-component-lib';
import type { Person } from '../shared/contract';
import { avatarUrl } from '../shared/people';

/** Profile picture and username for each person; initials stand in when no GitHub account is known. */
export const People = ({ people, empty }: { people: Person[]; empty?: string }) =>
	people.length === 0 ? (
		empty ? (
			<FSTypography variant="body2" color="text.secondary">
				{empty}
			</FSTypography>
		) : null
	) : (
		<FSStack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
			{people.map((p) => (
				<FSStack key={p.login ?? p.name} direction="row" spacing={1} alignItems="center">
					<FSAvatar
						src={avatarUrl(p.login) ?? undefined}
						alt={p.name}
						sx={{ width: 24, height: 24, fontSize: 12 }}
					>
						{p.name.charAt(0).toUpperCase()}
					</FSAvatar>
					<FSTypography variant="body2">{p.login ?? p.name}</FSTypography>
				</FSStack>
			))}
		</FSStack>
	);
