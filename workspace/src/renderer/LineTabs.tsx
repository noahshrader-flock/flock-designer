import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

/**
 * Line tabs, shadcn's set for a panel or a screen: the strip runs **edge to edge** across it, resting on a bottom border,
 * each tab an equal share of the width, with nothing padded around it; the padding is the content's, under it, which
 * scrolls on its own so the strip stays at the top. One piece for every row of tabs in the app's panes (the tokens panel's
 * Color, Spacing and Shape; the Design System tab's own), so they are the same, with no padding or height of their own to
 * remember. Used as shadcn's Tabs are: a root, a list of triggers, and a content for each. Each tab's label is in title
 * case, whatever it was written in (`TabsTrigger`).
 */
export const LineTabs = ({ className, ...props }: ComponentProps<typeof Tabs>) => (
	<Tabs data-slot="line-tabs" className={cn('min-h-0 flex-1 gap-0', className)} {...props} />
);

export const LineTabsList = ({ className, ...props }: ComponentProps<typeof TabsList>) => (
	<TabsList variant="line" className={cn('w-full border-b', className)} {...props} />
);

export const LineTabsTrigger = TabsTrigger;

export const LineTabsContent = ({ className, ...props }: ComponentProps<typeof TabsContent>) => (
	<TabsContent className={cn('min-h-0 flex-1 overflow-y-auto p-4', className)} {...props} />
);
