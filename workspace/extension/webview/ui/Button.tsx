import type { ReactNode } from 'react';

/**
 * VS Code's button, as its welcome views and dialogs use one: primary, in the theme's button colours, or `secondary`
 * (Cancel). The width of the side bar, unless it is in a row of them. `type="submit"` is a form's own.
 */
export const Button = ({
	onClick,
	type = 'button',
	secondary = false,
	disabled = false,
	children,
}: {
	onClick?: () => void;
	type?: 'button' | 'submit';
	secondary?: boolean;
	disabled?: boolean;
	children: ReactNode;
}) => (
	<button type={type} className={secondary ? 'button button-secondary' : 'button'} disabled={disabled} {...(onClick ? { onClick } : {})}>
		{children}
	</button>
);
