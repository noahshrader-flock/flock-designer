import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

/**
 * Tabs in a side panel, shadcn's line tabs set for one: the strip runs **edge to edge** across the panel, resting on a
 * bottom border, with nothing padded around it; the padding is the content's, under it, which scrolls on its own so the
 * strip stays at the top. One piece, so any panel with tabs (the tokens panel today) has them the same, with no padding
 * of its own to remember. Used as shadcn's Tabs are: a root, a list of triggers, and a content for each.
 */
export const PanelTabs = ({ className, ...props }: ComponentProps<typeof Tabs>) => (
	<Tabs data-slot="panel-tabs" className={cn('min-h-0 flex-1 gap-0', className)} {...props} />
);

export const PanelTabsList = ({ className, ...props }: ComponentProps<typeof TabsList>) => (
	<TabsList variant="line" className={cn('w-full border-b', className)} {...props} />
);

export const PanelTabsTrigger = TabsTrigger;

export const PanelTabsContent = ({ className, ...props }: ComponentProps<typeof TabsContent>) => (
	<TabsContent className={cn('min-h-0 flex-1 overflow-y-auto p-4', className)} {...props} />
);
