import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * VS Code's own: its loading icon, turning (`codicon-modifier-spin`, from the codicon stylesheet the panel and the review
 * page both load). Hidden from assistive technology, as every icon is: the words beside it say what is being waited for.
 */
export const Spinner = () => <Icon name="loading" className="codicon-modifier-spin" />;

/** The spinner, a little room, then what is being waited for: the spinner is the size of those words, and on their first line. */
export const Waiting = ({ children }: { children: ReactNode }) => (
	<span className="waiting">
		<Spinner />
		<span>{children}</span>
	</span>
);
