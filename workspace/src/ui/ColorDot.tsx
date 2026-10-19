import type { Ref } from 'react';
import { Badge } from './Badge';
import { ChangedMark } from './ChangedMark';
import { Swatch } from './Swatch';

/**
 * Every color a person can open, as **only the dot**: its tooltip is the token's name (`says`), never name, swatch and hex
 * side by side. Its tooltip, `mark` and `flag` (contrast below the target) are its description, since a button's name
 * (`Change <name>`) is all that is read of what is inside it.
 */
export const ColorDot = ({
	value,
	says,
	name,
	onPress,
	popup,
	mark,
	flag,
	buttonRef,
}: {
	value: string;
	says?: string;
	name: string;
	onPress?: () => void;
	/** Its control is a popover under it, shown while `open`. */
	popup?: { open: boolean };
	mark?: 'Changed' | 'Tried';
	flag?: string;
	buttonRef?: Ref<HTMLButtonElement>;
}) => {
	const parts = (
		<>
			<Swatch value={value} />
			{flag && <Badge tone="warning" label={flag} className="color-dot-flag" said />}
			{mark && <ChangedMark says={mark} said />}
		</>
	);
	const described = [says === name ? undefined : says, mark, flag].filter((s): s is string => s !== undefined).join(', ');
	const tooltip = says === undefined ? {} : { title: says };
	if (!onPress)
		return (
			<span role="img" className="color-dot" aria-label={described ? `${name}: ${described}` : name} {...tooltip}>
				{parts}
			</span>
		);
	return (
		<button
			ref={buttonRef}
			type="button"
			className="color-dot"
			aria-label={`Change ${name}`}
			{...(described ? { 'aria-description': described } : {})}
			{...tooltip}
			{...(popup ? { 'aria-haspopup': 'dialog', 'aria-expanded': popup.open } : {})}
			onClick={onPress}
		>
			{parts}
		</button>
	);
};
