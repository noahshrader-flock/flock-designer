import type { ReactNode } from 'react';

/**
 * A view's heading, the same on every tab of the Design System that has one (Components, Primitives, Voice and Tone): its
 * title, and, at the right, what can be done to the whole page (`action`). The title alone: the view says the rest.
 */
export const PageHeading = ({ title, action }: { title: string; action?: ReactNode }) => (
	<div data-page-heading className="flex items-center justify-between gap-4">
		<h2 className="min-w-0 text-base font-semibold">{title}</h2>
		{action && <div data-page-heading-action>{action}</div>}
	</div>
);
