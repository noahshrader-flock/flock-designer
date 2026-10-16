import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * A button that is an icon alone, as VS Code's view and row actions are: named for assistive technology, and on hover. The
 * default size is the search box's; `small` is for what sits in a row, a card or a header.
 */
export const IconButton = ({
	icon,
	label,
	onClick,
	disabled = false,
	size = 'default',
	className,
}: {
	/** A codicon's name, or an icon drawn (`ModeIcon`) where the font has none. */
	icon: string | ReactNode;
	label: string;
	onClick: () => void;
	disabled?: boolean;
	size?: 'default' | 'small';
	/** What it is called by where it is, for the stylesheet to place it. */
	className?: string;
}) => (
	<button
		type="button"
		className={['icon-button', ...(size === 'small' ? ['icon-button-small'] : []), ...(className ? [className] : [])].join(' ')}
		aria-label={label}
		title={label}
		disabled={disabled}
		onClick={onClick}
	>
		{typeof icon === 'string' ? <Icon name={icon} /> : icon}
	</button>
);
