import { LogOutIcon } from 'lucide-react';
import type { GitHubUser } from '../shared/domain/account';
import { Person } from '../renderer/Person';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '../renderer/ui/dropdown-menu';

/**
 * Who is signed in on the published page, as their picture at the end of the bar, the size of the button beside it. Pressed,
 * it says who they are and offers Sign out, which forgets the sign-in kept in this browser.
 */
export const AccountMenu = ({ user, onSignOut }: { user: GitHubUser; onSignOut: () => void }) => (
	<DropdownMenu>
		<DropdownMenuTrigger asChild>
			<button
				type="button"
				aria-label={`Signed in as ${user.login}`}
				className="focus-visible:ring-ring/50 cursor-pointer rounded-full outline-none focus-visible:ring-[3px]"
			>
				<Person name={user.login} src={user.avatarUrl} />
			</button>
		</DropdownMenuTrigger>
		<DropdownMenuContent align="end" className="w-auto">
			<DropdownMenuLabel data-signed-in-as className="flex flex-col">
				<span>{user.name ?? user.login}</span>
				{user.name && <span className="text-muted-foreground text-xs font-normal">{user.login}</span>}
			</DropdownMenuLabel>
			<DropdownMenuSeparator />
			<DropdownMenuItem onSelect={onSignOut}>
				<LogOutIcon />
				Sign out
			</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>
);
