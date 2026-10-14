import type { ReactNode } from 'react';
import { Button } from './Button';

/**
 * Something in the way, said where it is, in VS Code's warning colours: what (`title`), why, and what can be done about
 * it (`onRetry`, Try again), as a tab's preview that could not be built, or a change that could not be tried.
 */
export const Notice = ({ title, children, onRetry }: { title?: string; children: ReactNode; onRetry?: () => void }) => (
	<div className="notice">
		{title && <p className="notice-title">{title}</p>}
		<p>{children}</p>
		{onRetry && <Button onClick={onRetry}>Try again</Button>}
	</div>
);

/** A design system tab's whole page, while it cannot show what it is for: reading, or why not and Try again. */
export const TabNote = ({ note, onRetry }: { note: string; onRetry?: () => void }) => (
	<div className="tab-note">
		<p className="quiet">{note}</p>
		{onRetry && <Button onClick={onRetry}>Try again</Button>}
	</div>
);
