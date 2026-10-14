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
}: {
	icon: string;
	label: string;
	onClick: () => void;
	disabled?: boolean;
	size?: 'default' | 'small';
}) => (
	<button
		type="button"
		className={size === 'small' ? 'icon-button icon-button-small' : 'icon-button'}
		aria-label={label}
		title={label}
		disabled={disabled}
		onClick={onClick}
	>
		<Icon name={icon} />
	</button>
);
