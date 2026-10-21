import type { ReactNode } from 'react';
import { Icon } from './Icon';
import { Spinner } from './Spinner';

export const Button = ({
	onPress,
	type = 'button',
	variant = 'primary',
	disabled = false,
	busy = false,
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
	 * out (Close). `ghost`: the way out beside what is done (Cancel). `danger`: what cannot be undone from here (Delete).
	 */
	variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
	disabled?: boolean;
	/** Being done: a spinner before the words, and not pressed again. */
	busy?: boolean;
	external?: boolean;
	icon?: string;
	label?: string;
	pressed?: boolean;
	title?: string;
	children?: ReactNode;
}) => {
	const hasWords = children !== undefined && children !== null && children !== false && children !== '';
	return (
		<button
			type={type}
			className={`button button-${pressed === undefined ? variant : pressed ? 'primary' : 'secondary'}${external || icon || busy ? ' button-with-icon' : ''}${icon && !hasWords ? ' button-icon' : ''}`}
			disabled={disabled || busy}
			{...(onPress ? { onClick: onPress } : {})}
			{...(busy ? { 'aria-busy': true } : {})}
			{...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
			{...(label ? { 'aria-label': label } : {})}
			{...(title ? { title } : {})}
		>
			{busy && <Spinner />}
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

export const ButtonRow = ({ end = false, children }: { end?: boolean; children: ReactNode }) => (
	<div className={end ? 'button-row button-row-end' : 'button-row'}>{children}</div>
);
