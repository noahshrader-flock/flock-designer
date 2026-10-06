import type { GitHubUser } from '../shared/contract';
import { PublishLine, usePublishStatus } from './PublishStatus';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';

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
 * steps aside (the review screen swaps it for a still picture), and returns when it closes.
 */
export const TopNav = ({
	user,
	onSignOut,
	onMenuOpenChange,
}: {
	user: GitHubUser | null;
	onSignOut: () => void;
	/** The screen under the bar needs to know, so a preview does not cover the menu. */
	onMenuOpenChange: (open: boolean) => void;
}) => {
	const [publishStatus] = usePublishStatus();

	return (
		<header
			className={`app-drag bg-card fixed inset-x-0 top-0 z-40 flex h-(--nav-height) items-center border-b ${
				// 108px leaves a clear gap after the macOS window buttons (they end near 76px);
				// elsewhere the overlay controls sit on the right.
				onMac ? 'pr-6 pl-[108px]' : 'pr-[150px] pl-6'
			}`}
		>
			<span className="mr-6 text-base font-bold whitespace-nowrap">Flock Designer</span>

			{user && (
				<nav className="app-no-drag self-stretch">
					<span className="border-foreground flex h-full items-center border-b-2 px-1 text-sm font-medium">Projects</span>
				</nav>
			)}

			<div className="grow" />

			{/* Where publishing is, on every screen: a problem must be visible wherever the person is working. */}
			<div className="app-no-drag mr-4">
				<PublishLine status={publishStatus} />
			</div>

			{user && (
				<DropdownMenu onOpenChange={onMenuOpenChange}>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" className="app-no-drag h-auto gap-3 py-1 font-normal">
							<Avatar size="sm">
								<AvatarImage src={user.avatarUrl ?? undefined} alt={user.name ?? user.login} />
								<AvatarFallback>{(user.name ?? user.login).charAt(0).toUpperCase()}</AvatarFallback>
							</Avatar>
							{user.name ?? user.login}
						</Button>
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
