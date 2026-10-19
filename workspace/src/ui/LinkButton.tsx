import type { ReactNode } from 'react';
import type { Marks } from './marks';

/** For what is done in passing; what changes a thing is a `Button`. */
export const LinkButton = ({ children, onPress, marks }: { children: ReactNode; onPress: () => void; marks?: Marks }) => (
	<button type="button" className="link" onClick={onPress} {...marks}>
		{children}
	</button>
);
