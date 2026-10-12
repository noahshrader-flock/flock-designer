import { LogOutIcon, SettingsIcon } from 'lucide-react';
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
 * Left to right: room for the macOS window buttons and the product name, the sections (Projects, Design System) as
 * tabs in the pill look, exactly in the center, and the account at the far right. The window has no separate toolbar
 * above this -- the bar is the toolbar.
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
	onSettings,
}: {
	user: GitHubUser | null;
	section: Section;
	onSectionChange: (section: Section) => void;
	onSignOut: () => void;
	/** Opens Settings, from the account menu. */
	onSettings?: () => void;
}) => {
	return (
		<header
			// Three columns, the outer two equal, so the sections are centered on the window whatever is at either side. The
			// room for the window's own buttons is on the columns, not the bar, or it would move the center.
			className="app-drag bg-card fixed inset-x-0 top-0 z-40 grid h-(--nav-height) grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b"
		>
			{/* 108px leaves a clear gap after the macOS window buttons (they end near 76px); elsewhere the overlay controls sit on the right. */}
			<span className={`text-base font-bold whitespace-nowrap ${onMac ? 'pl-[108px]' : 'pl-6'}`}>DSNR</span>

			{user ? (
				<Tabs value={section} onValueChange={(next) => onSectionChange(next as Section)} className="app-no-drag">
					<TabsList size="lg">
						{SECTIONS.map(({ id, label }) => (
							<TabsTrigger key={id} value={id} className="px-3">
								{label}
							</TabsTrigger>
						))}
					</TabsList>
				</Tabs>
			) : (
				<div />
			)}

			<div className={`justify-self-end ${onMac ? 'pr-6' : 'pr-[150px]'}`}>
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
							<DropdownMenuItem onSelect={onSettings}>
								<SettingsIcon />
								Settings
							</DropdownMenuItem>
							<DropdownMenuItem onSelect={onSignOut}>
								<LogOutIcon />
								Sign out
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</div>
		</header>
	);
};
