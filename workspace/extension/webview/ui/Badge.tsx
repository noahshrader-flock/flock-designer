/**
 * A count beside a row, as VS Code draws one on a view or a tab: its badge colours, and what the number is, said. A `tone`
 * for a count that means something of DSNR's: the brand's for comments, which are what it is for; the warning's for what
 * is wrong. Other counts stay VS Code's own. With `onPress` it is a button, named and with a tooltip, that opens what the
 * count is of.
 */
export const Badge = ({
	count,
	label,
	tone = 'neutral',
	onPress,
}: {
	count: number;
	label: string;
	tone?: 'neutral' | 'brand' | 'warning';
	onPress?: () => void;
}) => {
	const className = tone === 'neutral' ? 'badge' : `badge badge-${tone}`;
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
