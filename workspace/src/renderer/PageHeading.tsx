import type { ReactNode } from 'react';

/**
 * A view's heading, the same on every tab of the Design System that has one (Components, Primitives, Voice and Tone): its
 * title, a line under it that says what the view is for, and, at the right, what can be done to the whole page (`action`).
 * What it says is general (what a design system's view is), since any design system can be connected.
 */
export const PageHeading = ({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) => (
	<div data-page-heading className="flex items-start justify-between gap-4">
		<div className="flex min-w-0 flex-col gap-1">
			<h2 className="text-base font-semibold">{title}</h2>
			<p className="text-muted-foreground text-sm">{children}</p>
		</div>
		{action && <div data-page-heading-action>{action}</div>}
	</div>
);
