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
 * a browser: Storybook, GitHub) says so with the external link icon after its words (`external`). `icon` is a codicon before
 * its words, or all of it, when it is named by `label` (beside a number, or alone).
 *
 * One that turns a mode on and off (`pressed`: Comment, the comments' list) says whether it is on, to assistive technology
 * and to the eye: filled as the primary when it is, outlined as the secondary when it is not.
 */
export const Button = ({
	onPress,
	type = 'button',
	variant = 'primary',
	disabled = false,
	external = false,
	icon,
	label,
	pressed,
	title,
	children,
}: {
	onPress?: () => void;
	type?: 'button' | 'submit';
	variant?: 'primary' | 'secondary' | 'ghost';
	disabled?: boolean;
	external?: boolean;
	icon?: string;
	/** Its name, when its words do not say it (an icon and a number). */
	label?: string;
	pressed?: boolean;
	/** What it does, said as its tooltip. */
	title?: string;
	children?: ReactNode;
}) => {
	// An icon with no words is a square (`.button-icon`), like every icon alone.
	const hasWords = children !== undefined && children !== null && children !== false && children !== '';
	return (
		<button
			type={type}
			className={`button button-${pressed === undefined ? variant : pressed ? 'primary' : 'secondary'}${external || icon ? ' button-with-icon' : ''}${icon && !hasWords ? ' button-icon' : ''}`}
			disabled={disabled}
			{...(onPress ? { onClick: onPress } : {})}
			{...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
			{...(label ? { 'aria-label': label } : {})}
			{...(title ? { title } : {})}
		>
			{icon && <Icon name={icon} />}
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
};

/**
 * Buttons side by side, each as wide as its words, wrapping when the row is narrow (a tab's actions, a branch's, a message's,
 * a bar's): where a button is not the width of the side bar. `end` puts them at the row's end (a form's Cancel and Save).
 */
export const ButtonRow = ({ end = false, children }: { end?: boolean; children: ReactNode }) => (
	<div className={end ? 'button-row button-row-end' : 'button-row'}>{children}</div>
);
