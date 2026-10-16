import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * DSNR's three buttons, laid out as VS Code's welcome views and dialogs lay theirs out, drawn as Claude Code draws its own:
 * - `primary` (the default), what a place is for, in DSNR's brand: one to a place.
 * - `secondary`, outlined: another thing that can be done there (Source, Reset), or the one way out of a dialog that only
 *   says something (Close).
 * - `ghost`, nothing but its words: the way out, beside what is done (Cancel), or leaving a change (Start over).
 *
 * The width of the side bar, unless it is in a row of them. `type="submit"` is a form's own. One that goes out of VS Code (to
 * a browser: Storybook, GitHub) says so with the external link icon after its words (`external`).
 */
export const Button = ({
	onClick,
	type = 'button',
	variant = 'primary',
	disabled = false,
	external = false,
	children,
}: {
	onClick?: () => void;
	type?: 'button' | 'submit';
	variant?: 'primary' | 'secondary' | 'ghost';
	disabled?: boolean;
	external?: boolean;
	children: ReactNode;
}) => (
	<button
		type={type}
		className={`button button-${variant}${external ? ' button-external' : ''}`}
		disabled={disabled}
		{...(onClick ? { onClick } : {})}
	>
		{external ? (
			<>
				<span>{children}</span>
				<Icon name="link-external" size="small" />
			</>
		) : (
			children
		)}
	</button>
);
