import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

/**
 * Line tabs, shadcn's set for a panel or a screen: the strip runs **edge to edge** across it, resting on a bottom border,
 * each tab an equal share of the width, with nothing padded around it; the padding is the content's, under it, which
 * scrolls on its own so the strip stays at the top. One piece for every row of tabs in the app (the tokens panel's Color,
 * Spacing and Shape; the Design System tab's own), so they are the same, with no padding or height of their own to
 * remember. Used as shadcn's Tabs are: a root, a list of triggers, and a content for each. Each tab's label is in title
 * case, whatever it was written in (`TabsTrigger`).
 *
 * **A bar of tabs** (`LineTabsList bar`) is the one option: the strip is as tall as a toolbar and inset as one is, on its
 * background, with its tabs as wide as their labels, at the left, not shares of the width, so it sits over a toolbar as
 * the same bar. Said here, once, and set on nothing where it is used.
 */
export const LineTabs = ({ className, ...props }: ComponentProps<typeof Tabs>) => (
	<Tabs data-slot="line-tabs" className={cn('min-h-0 flex-1 gap-0', className)} {...props} />
);

/** What makes a strip a bar of tabs: a toolbar's height, inset and background, and tabs as wide as their labels. */
const BAR = 'justify-start bg-card px-(--page-padding) group-data-horizontal/tabs:h-(--toolbar-height) [&>[role=tab]]:flex-none';

export const LineTabsList = ({ className, bar = false, ...props }: ComponentProps<typeof TabsList> & { bar?: boolean }) => (
	<TabsList variant="line" data-bar={bar || undefined} className={cn('w-full border-b', bar && BAR, className)} {...props} />
);

export const LineTabsTrigger = TabsTrigger;

export const LineTabsContent = ({ className, ...props }: ComponentProps<typeof TabsContent>) => (
	<TabsContent className={cn('min-h-0 flex-1 overflow-y-auto p-4', className)} {...props} />
);
