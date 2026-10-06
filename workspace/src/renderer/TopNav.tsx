import type { GitHubUser } from '../shared/contract';
import { PublishLine, usePublishStatus } from './PublishStatus';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';

/** Height of the bar, which the rest of the window is pushed down by. */
export const NAV_HEIGHT = 56;

/** The window has no native title bar on macOS, so the bar is what you drag. Controls opt out. */
const drag = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

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
	const [publishStatus] = usePublishStatus();

	return (
		<header
			style={{ ...drag, height: NAV_HEIGHT }}
			className={`bg-card fixed inset-x-0 top-0 z-[1200] flex items-center border-b ${
				// 108px leaves a clear gap after the macOS window buttons (they end near 76px);
				// elsewhere the overlay controls sit on the right.
				onMac ? 'pr-6 pl-[108px]' : 'pr-[150px] pl-6'
			}`}
		>
			<span className="mr-6 text-base font-bold whitespace-nowrap">Flock Designer</span>

			{user && (
				<nav style={noDrag} className="self-stretch">
					<span className="border-foreground flex h-full items-center border-b-2 px-1 text-sm font-medium">Projects</span>
				</nav>
			)}

			<div className="grow" />

			{/* Where publishing is, on every screen: a problem must be visible wherever the person is working. */}
			<div style={noDrag} className="mr-4">
				<PublishLine status={publishStatus} />
			</div>

			{user && (
				<DropdownMenu onOpenChange={(open) => void window.workspace.pageHold('menu', open)}>
					<DropdownMenuTrigger
						style={noDrag}
						className="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md border-0 bg-transparent px-2 py-1 font-[inherit] outline-none"
					>
						<Avatar>
							<AvatarImage src={user.avatarUrl ?? undefined} alt={user.name ?? user.login} />
							<AvatarFallback>{(user.name ?? user.login).charAt(0).toUpperCase()}</AvatarFallback>
						</Avatar>
						<span className="text-sm">{user.name ?? user.login}</span>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="min-w-[200px]">
						<div className="px-2 py-1.5">
							<p className="text-sm font-medium">{user.name ?? user.login}</p>
							<p className="text-muted-foreground text-xs">@{user.login}</p>
						</div>
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={onSignOut}>Sign out</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</header>
	);
};
