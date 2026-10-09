import { LogOutIcon } from 'lucide-react';
import type { GitHubUser } from '../shared/contract';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';

export type Section = 'projects' | 'design-system';

const SECTIONS: { id: Section; label: string }[] = [
	{ id: 'projects', label: 'Projects' },
	{ id: 'design-system', label: 'Design System' },
];

const onMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent);

/**
 * The top bar: fixed to the top of the window, always.
 *
 * Left to right: room for the macOS window buttons, the product name, the
 * sections (Projects, Design System) as tabs in the pill look, and the account. The window
 * has no separate toolbar above this -- the bar is the toolbar.
 *
 * The preview is a native view that sits above all page content. The account menu
 * needs nothing special for that: the review screen notices any pop-up over the
 * preview (see overlays.ts) and swaps it for a still picture while it is open.
 */
export const TopNav = ({
	user,
	section,
	onSectionChange,
	onSignOut,
}: {
	user: GitHubUser | null;
	section: Section;
	onSectionChange: (section: Section) => void;
	onSignOut: () => void;
}) => {
	return (
		<header
			className={`app-drag bg-card fixed inset-x-0 top-0 z-40 flex h-(--nav-height) items-center border-b ${
				// 108px leaves a clear gap after the macOS window buttons (they end near 76px);
				// elsewhere the overlay controls sit on the right.
				onMac ? 'pr-6 pl-[108px]' : 'pr-[150px] pl-6'
			}`}
		>
			<span className="mr-10 text-base font-bold whitespace-nowrap">DSNR</span>

			{user && (
				<Tabs value={section} onValueChange={(next) => onSectionChange(next as Section)} className="app-no-drag">
					<TabsList>
						{SECTIONS.map(({ id, label }) => (
							<TabsTrigger key={id} value={id} className="px-3">
								{label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			)}

			<div className="grow" />

			{user && (
				<DropdownMenu>
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
						<DropdownMenuItem onSelect={onSignOut}>
							<LogOutIcon />
							Sign out
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			)}
		</header>
	);
};
