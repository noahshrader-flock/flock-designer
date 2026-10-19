import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * DSNR's three buttons, laid out as VS Code's welcome views and dialogs lay theirs out, drawn as Claude Code draws its own.
 * The width of the side bar, unless it is in a row of them (`ButtonRow`).
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
	/**
	 * `primary`: what a place is for, one to a place. `secondary`: another thing to do there (Reset), or a dialog's one way
	 * out (Close). `ghost`: the way out beside what is done (Cancel).
	 */
	variant?: 'primary' | 'secondary' | 'ghost';
	disabled?: boolean;
	/** It goes out of VS Code (to Storybook, GitHub): the external link icon after its words says so. */
	external?: boolean;
	/** A codicon before its words, or all of it when it is named by `label`. */
	icon?: string;
	/** Its name, when its words do not say it (an icon and a number). */
	label?: string;
	/** It turns a mode on and off (Comment): filled as the primary when on, outlined as the secondary when off. */
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
