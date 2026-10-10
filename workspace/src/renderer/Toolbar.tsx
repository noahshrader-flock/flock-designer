import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TabsList, TabsTrigger } from './ui/tabs';

/**
 * The strip under the top bar that says where you are and holds what you can do there. One component,
 * so the project list and a prototype's review screen carry the same one: same height, same padding,
 * same line under it. Its height is the window's `--toolbar-height`, which the screens below it count on.
 *
 * **The one exception is a bar of tabs** (`tabs`): its children run the bar's whole height instead of being centered in
 * it, so the line under the chosen tab rests on the bar's own line, with nothing floating between them. The tabs' names
 * stay centered in the tabs.
 */
export const Toolbar = ({ children, className = '', tabs = false }: { children: ReactNode; className?: string; tabs?: boolean }) => (
	<div
		data-toolbar-tabs={tabs || undefined}
		className={`bg-card flex h-(--toolbar-height) shrink-0 ${tabs ? 'items-stretch' : 'items-center'} gap-4 border-b px-(--page-padding) ${className}`}
	>
		{children}
	</div>
);

/**
 * The tabs of a bar of tabs (`Toolbar tabs`), shadcn's line tabs set for one, as `PanelTabs` sets them for a panel: the list
 * runs the bar's height with none of the padding that keeps a pill's tabs off its edge, and each tab does too, so the line
 * under the chosen one is drawn over the bar's own. Used as shadcn's are, inside its Tabs.
 */
export const ToolbarTabsList = ({ className, ...props }: ComponentProps<typeof TabsList>) => (
	<TabsList variant="line" className={cn('p-0 group-data-horizontal/tabs:h-full', className)} {...props} />
);

export const ToolbarTab = ({ className, ...props }: ComponentProps<typeof TabsTrigger>) => (
	<TabsTrigger className={cn('group-data-horizontal/tabs:h-full group-data-horizontal/tabs:after:-bottom-px', className)} {...props} />
);
