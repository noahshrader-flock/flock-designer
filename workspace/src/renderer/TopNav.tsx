import {
	FSAvatar,
	FSBox,
	FSDivider,
	FSMenu,
	FSMenuItem,
	FSStack,
	FSTab,
	FSTabs,
	FSTypography,
} from '@flocksafety/flock-react-component-lib';
import { useState } from 'react';
import type { GitHubUser } from '../shared/contract';

/** Height of the bar, which the rest of the window is pushed down by. */
export const NAV_HEIGHT = 56;

/** The window has no native title bar on macOS, so the bar is what you drag. Controls opt out. */
const drag = { WebkitAppRegion: 'drag' } as const;
const noDrag = { WebkitAppRegion: 'no-drag' } as const;

const onMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

/**
 * The top bar: fixed to the top of the window, always.
 *
 * Left to right: room for the macOS window buttons, the product name, the
 * sections, and the account. There is one section today, Projects. The window
 * has no separate toolbar above this -- the bar is the toolbar.
 *
 * The preview is a native view that sits above all page content, so an open
 * account menu would be hidden behind it. While the menu is open the preview
 * is hidden, and shown again when it closes.
 */
export const TopNav = ({ user, onSignOut }: { user: GitHubUser | null; onSignOut: () => void }) => {
	const [anchor, setAnchor] = useState<HTMLElement | null>(null);

	const setOpen = (el: HTMLElement | null) => {
		setAnchor(el);
		void window.workspace.pageHold('menu', el !== null);
	};

	return (
		<FSBox
			component="header"
			sx={{
				...drag,
				position: 'fixed',
				top: 0,
				left: 0,
				right: 0,
				height: NAV_HEIGHT,
				zIndex: 1200,
				display: 'flex',
				alignItems: 'center',
				// 108px leaves a clear gap after the macOS window buttons (they end near 76px);
				// elsewhere the overlay controls sit on the right.
				pl: onMac ? '108px' : 3,
				pr: onMac ? 3 : '150px',
				bgcolor: 'background.paper',
				borderBottom: 1,
				borderColor: 'divider',
			}}
		>
			<FSTypography variant="subtitle1" component="span" sx={{ fontWeight: 700, whiteSpace: 'nowrap', mr: 3 }}>
				Flock Designer
			</FSTypography>

			{user && (
				<FSTabs value="projects" sx={{ ...noDrag, minHeight: NAV_HEIGHT, alignSelf: 'stretch' }}>
					<FSTab value="projects" label="Projects" sx={{ minHeight: NAV_HEIGHT }} />
				</FSTabs>
			)}

			<FSBox sx={{ flexGrow: 1 }} />

			{user && (
				<>
					<FSBox
						component="button"
						aria-haspopup="menu"
						aria-expanded={anchor !== null}
						onClick={(e: React.MouseEvent<HTMLElement>) => setOpen(e.currentTarget)}
						sx={{
							...noDrag,
							display: 'flex',
							alignItems: 'center',
							gap: 1.5,
							border: 0,
							bgcolor: 'transparent',
							borderRadius: 1,
							px: 1,
							py: 0.5,
							cursor: 'pointer',
							font: 'inherit',
							color: 'text.primary',
							'&:hover': { bgcolor: 'action.hover' },
						}}
					>
						<FSAvatar src={user.avatarUrl ?? undefined} alt={user.name ?? user.login} sx={{ width: 32, height: 32 }}>
							{(user.name ?? user.login).charAt(0).toUpperCase()}
						</FSAvatar>
						<FSTypography variant="body2" component="span">
							{user.name ?? user.login}
						</FSTypography>
					</FSBox>
					<FSMenu
						anchorEl={anchor}
						open={anchor !== null}
						onClose={() => setOpen(null)}
						anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
						transformOrigin={{ vertical: 'top', horizontal: 'right' }}
					>
						<FSStack sx={{ px: 2, py: 1, minWidth: 200 }}>
							<FSTypography variant="subtitle2">{user.name ?? user.login}</FSTypography>
							<FSTypography variant="caption" color="text.secondary">
								@{user.login}
							</FSTypography>
						</FSStack>
						<FSDivider />
						<FSMenuItem
							onClick={() => {
								setOpen(null);
								onSignOut();
							}}
						>
							Sign out
						</FSMenuItem>
					</FSMenu>
				</>
			)}
		</FSBox>
	);
};
