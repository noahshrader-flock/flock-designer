import type { ReactNode } from 'react';

/**
 * The strip under the top bar that says where you are and holds what you can do there. One component,
 * so the project list and a prototype's review screen carry the same one: same height, same padding,
 * same line under it. Its height is the window's `--toolbar-height`, which the screens below it count on.
 */
export const Toolbar = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
	<div className={`bg-card flex h-(--toolbar-height) shrink-0 items-center gap-4 border-b px-4 ${className}`}>{children}</div>
);
