import type { Ref } from 'react';
import { Badge } from './Badge';
import { ChangedMark } from './ChangedMark';
import { Swatch } from './Swatch';

/**
 * A color wherever it is something to look at and to press: **only the dot.** Its tooltip is the token's name and nothing
 * else (`says`; none for a color that is no token), and pressing it opens its control. One way for every color a person can
 * open, in the grid of roles, a component's Styles, and a token's row, so none says its name, its swatch and its hex side by
 * side. Without `onPress` it is the same dot with nothing to press (a color shown, not changed here).
 *
 * `name` is what it is called to assistive technology: its button is `Change <name>`, and without a button it is
 * `<name>`. Marked when changed or tried (`mark`), and when its contrast is below the target (`flag`, said by that text).
 * What else it says (its tooltip when that is not its name, the mark, the flag) is its description: a button's name is all
 * that is read of what is inside it, so the mark and the flag drawn on it say nothing themselves. Its color is the token's
 * own, a value known only as it runs, set on the element as `Swatch` does.
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
