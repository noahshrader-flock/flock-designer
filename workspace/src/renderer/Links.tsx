import { ExternalLinkIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { buttonVariants } from './ui/button';
import { DropdownMenuItem } from './ui/dropdown-menu';

/** How a link reads in text: the primary color, underlined, so it is seen as one without a hover. */
const LINK = 'text-primary underline underline-offset-4';

/**
 * A link out, which the app hands to the system's browser: underlined, with the mark that says it leaves the app. The
 * only way a screen links out, so every one looks and opens the same.
 */
export const OutLink = ({ href, children }: { href: string; children: ReactNode }) => (
	<a href={href} target="_blank" rel="noreferrer" className={cn(LINK, 'inline-flex items-center gap-1')}>
		{children}
		<ExternalLinkIcon className="size-3 shrink-0" />
	</a>
);

/**
 * Something to do, said as a link in a sentence ("Clear search", "Change", "Open V1 · I3"): shadcn's link button at the
 * size of the text around it, underlined as a link is, and never a submit.
 */
export const InlineAction = ({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) => (
	<button
		type="button"
		className={cn(buttonVariants({ variant: 'link' }), LINK, 'h-auto p-0 align-baseline text-[length:inherit] font-normal')}
		onClick={onClick}
		disabled={disabled}
	>
		{children}
	</button>
);

/** A link out as one of a menu's items, opened in the system's browser as every link out is. */
export const MenuLink = ({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) => (
	<DropdownMenuItem asChild>
		<a href={href} target="_blank" rel="noreferrer">
			{icon}
			{children}
		</a>
	</DropdownMenuItem>
);
