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
	icon: string;
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
		<Icon name={icon} />
	</button>
);
