import type { GitHubUser } from '../shared/domain/account';
import { Avatar } from '../ui/Avatar';
import { Menu } from '../ui/Menu';

/**
 * Who is signed in on the published page, as their picture at the end of the bar. Pressed, it says who they are (the
 * menu's heading: their name, and their login after it) and offers Sign out, which forgets the sign-in kept in this browser.
 */
export const AccountMenu = ({ user, onSignOut }: { user: GitHubUser; onSignOut: () => void }) => (
	<Menu
		label={`Signed in as ${user.login}`}
		face={<Avatar name={user.login} src={user.avatarUrl} />}
		sections={[
			{ heading: user.name ? `${user.name} · ${user.login}` : user.login, items: [{ label: 'Sign out', icon: 'sign-out', onSelect: onSignOut }] },
		]}
	/>
);
