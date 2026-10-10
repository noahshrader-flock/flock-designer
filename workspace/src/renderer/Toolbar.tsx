import type { ReactNode } from 'react';

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
		{...(tabs ? { 'data-toolbar-tabs': true } : {})}
		className={`bg-card flex h-(--toolbar-height) shrink-0 ${tabs ? 'items-stretch' : 'items-center'} gap-4 border-b px-(--page-padding) ${className}`}
	>
		{children}
	</div>
);
