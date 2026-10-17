/**
 * A count beside a row, as VS Code draws one on a view or a tab, and what the number is, said: in the grey of the toggles
 * at rest. A `tone` for a count that means something of DSNR's: the brand's for comments and changes, which are what it is
 * for; the warning's for what is wrong. With `onPress` it is a button, named and with a tooltip, that opens what the
 * count is of. With no count it is the same badge extra small and blank, a mark that something is wrong where a number
 * would not fit (hung off a swatch), said by its label.
 */
export const Badge = ({
	count,
	label,
	tone = 'neutral',
	onPress,
	className: extra,
}: {
	count?: number;
	label: string;
	tone?: 'neutral' | 'brand' | 'warning';
	onPress?: () => void;
	/** Where it sits, for a badge placed by its parent. */
	className?: string;
}) => {
	const className = `${tone === 'neutral' ? 'badge' : `badge badge-${tone}`}${count === undefined ? ' badge-xs' : ''}${extra ? ` ${extra}` : ''}`;
	if (count === undefined) return <span role="img" className={className} aria-label={label} title={label} />;
	return onPress ? (
		<button type="button" className={`${className} badge-button`} aria-label={label} title={label} onClick={onPress}>
			{count}
		</button>
	) : (
		<span className={className} aria-label={label}>
			{count}
		</span>
	);
};
