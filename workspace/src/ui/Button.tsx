import type { ReactNode } from 'react';
import { Icon } from './Icon';

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

export const ButtonRow = ({ end = false, children }: { end?: boolean; children: ReactNode }) => (
	<div className={end ? 'button-row button-row-end' : 'button-row'}>{children}</div>
);
