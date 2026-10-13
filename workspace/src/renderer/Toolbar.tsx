import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The strip under the top bar that says where you are and holds what you can do there. One component, so every screen with
 * one (the project list, the Design System, a prototype's review screen, the published page's viewer) carries the same:
 * same height, same padding, same line under it. Its height is the window's `--toolbar-height`, which the screens below it
 * count on, and which a strip of tabs is as tall as too.
 */
export const Toolbar = ({ children, className }: { children: ReactNode; className?: string }) => (
	<div data-toolbar className={cn('bg-card flex h-(--toolbar-height) shrink-0 items-center gap-4 border-b px-(--page-padding)', className)}>
		{children}
	</div>
);

/**
 * What a toolbar's right-hand side holds, pushed there: what can be done here, evenly spaced and tighter than the toolbar's
 * own gap, so it reads as one group.
 */
export const ToolbarEnd = ({ children }: { children: ReactNode }) => (
	<>
		<div className="grow" />
		<div className="flex items-center gap-2">{children}</div>
	</>
);
