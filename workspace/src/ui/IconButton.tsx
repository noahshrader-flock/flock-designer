import { Icon } from './Icon';

/** Given `href`, it is a link that looks the same, since where it goes is an address, not something done here. */
export const IconButton = ({
	icon,
	label,
	onPress,
	href,
	size = 'default',
	className,
}: {
	icon: string;
	label: string;
	size?: 'default' | 'small';
	className?: string;
} & ({ onPress: () => void; href?: undefined } | { href: string; onPress?: undefined })) => {
	const classes = ['icon-button', ...(size === 'small' ? ['icon-button-small'] : []), ...(className ? [className] : [])].join(' ');
	return href !== undefined ? (
		<a className={classes} href={href} aria-label={label} title={label}>
			<Icon name={icon} />
		</a>
	) : (
		<button type="button" className={classes} aria-label={label} title={label} onClick={onPress}>
			<Icon name={icon} />
		</button>
	);
};
