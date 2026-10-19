import { Icon } from './Icon';

/**
 * A button that is an icon alone, as VS Code's view and row actions are: named for assistive technology, and on hover. The
 * default size is the search box's; `small` is for what sits in a row, a card or a header. Given `href`, it is a link that
 * looks the same (the way back to a page), since where it goes is an address, not something done here.
 */
export const IconButton = ({
	icon,
	label,
	onClick,
	href,
	disabled = false,
	size = 'default',
	className,
}: {
	icon: string;
	label: string;
	disabled?: boolean;
	size?: 'default' | 'small';
	/** What it is called by where it is, for the stylesheet to place it. */
	className?: string;
} & ({ onClick: () => void; href?: undefined } | { href: string; onClick?: undefined })) => {
	const classes = ['icon-button', ...(size === 'small' ? ['icon-button-small'] : []), ...(className ? [className] : [])].join(' ');
	return href !== undefined ? (
		<a className={classes} href={href} aria-label={label} title={label}>
			<Icon name={icon} />
		</a>
	) : (
		<button type="button" className={classes} aria-label={label} title={label} disabled={disabled} onClick={onClick}>
			<Icon name={icon} />
		</button>
	);
};
