import type { GitHubUser } from '../shared/domain/account';
import { Avatar } from '../ui/Avatar';
import { Menu } from '../ui/Menu';

export const AccountMenu = ({ user, onSignOut }: { user: GitHubUser; onSignOut: () => void }) => (
	<Menu
		label={`Signed in as ${user.login}`}
		face={<Avatar name={user.login} src={user.avatarUrl} />}
		sections={[
			{ heading: user.name ? `${user.name} · ${user.login}` : user.login, items: [{ label: 'Sign out', icon: 'sign-out', onSelect: onSignOut }] },
		]}
	/>
);
