/**
 * A count beside a row, as VS Code draws one, said by `label`: `brand` for comments and changes, `warning` for what is wrong.
 * With no count it is a small blank mark where a number would not fit (off a swatch); `said` hides it from assistive
 * technology inside what says it already (a color's dot).
 */
export const Badge = ({
	count,
	label,
	tone = 'neutral',
	onPress,
	className: extra,
	said = false,
}: {
	count?: number;
	label: string;
	tone?: 'neutral' | 'brand' | 'warning';
	onPress?: () => void;
	/** Where it sits, for a badge placed by its parent. */
	className?: string;
	said?: boolean;
}) => {
	const className = `${tone === 'neutral' ? 'badge' : `badge badge-${tone}`}${count === undefined ? ' badge-xs' : ''}${extra ? ` ${extra}` : ''}`;
	if (count === undefined)
		return said ? <span className={className} aria-hidden="true" /> : <span role="img" className={className} aria-label={label} title={label} />;
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
