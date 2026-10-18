import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** How big a bar's controls are: the standard size, or small (a quiet bar over a page). Said once, taken by each control. */
export type BarSize = 'default' | 'sm';

/** A button's size for a bar's: the same word, or its icon-only form (a square). */
export const barButtonSize = (size: BarSize, iconOnly = false): 'default' | 'sm' | 'icon' | 'icon-sm' =>
	iconOnly ? (size === 'sm' ? 'icon-sm' : 'icon') : size;

/**
 * The strip under the top bar that says where you are and holds what you can do there. One component, so every screen with
 * one (the project list, the Design System, a prototype's review screen, the published page's viewer) carries the same:
 * same height, same padding, same line under it. Its height is the window's `--toolbar-height`, which the screens below it
 * count on, and which a strip of tabs is as tall as too.
 *
 * `quiet` is a bar with no background and no line under it, so it does not look like part of what it is over: a prototype's
 * page, whose bar is not part of the design.
 */
export const Toolbar = ({ children, className, quiet = false }: { children: ReactNode; className?: string; quiet?: boolean }) => (
	<div
		data-toolbar
		className={cn(
			'flex h-(--toolbar-height) shrink-0 items-center gap-4 px-(--page-padding)',
			quiet ? 'bg-transparent' : 'bg-card border-b',
			className,
		)}
	>
		{children}
	</div>
);
