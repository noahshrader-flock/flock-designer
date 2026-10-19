import type { ReactNode } from 'react';
import type { Marks } from './marks';

/**
 * A button that reads as a link, in the link colour and underlined when pointed at: for what is done in passing, in a line of
 * text or beside a heading (Reset all, Clear search, a component's name that opens its tab). What changes a thing is a `Button`.
 */
export const LinkButton = ({ children, onPress, marks }: { children: ReactNode; onPress: () => void; marks?: Marks }) => (
	<button type="button" className="link" onClick={onPress} {...marks}>
		{children}
	</button>
);
