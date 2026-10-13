import type { ReactNode } from 'react';

/**
 * VS Code's button, as its welcome views use one: primary, the width of the side bar, in the theme's button colours.
 */
export const Button = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
	<button type="button" className="button" onClick={onClick}>
		{children}
	</button>
);
