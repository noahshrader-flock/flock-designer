import type { Ref } from 'react';
import type { DesignToken } from '../../../src/shared/contract';
import { labelOf } from '../../../src/shared/tokens';
import { Badge } from './Badge';
import { Swatch } from './Swatch';

/** What a color token's dot is: its color, called and told by its name, as the grid of roles and a token's row both have it. */
export const tokenDot = (token: DesignToken): { value: string; name: string; says: string } => ({
	value: token.value,
	name: labelOf(token),
	says: labelOf(token),
});

/**
 * A color wherever it is something to look at and to press: **only the dot.** Its tooltip is the token's name and nothing
 * else (`says`; none for a color that is no token), and pressing it opens its control. One way for every color a person can
 * open, in the grid of roles, a component's Values, and a token's row, so none says its name, its swatch and its hex side by
 * side. Without `onPress` it is the same dot with nothing to press (a color shown, not changed here).
 *
 * `name` is what it is called to assistive technology: its button is `Change <name>`, and without a button it is
 * `<name>`, with the token's name after it when it has one. Marked when changed or tried (`mark`, by what it is said to be),
 * and when its contrast is below the target (`flag`, said by that text). Its color is the token's own, a value known only as
 * it runs, set on the element as `Swatch` does.
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
			{flag && <Badge tone="warning" label={flag} className="color-dot-flag" />}
			{mark && <span data-changed-mark className="color-dot-mark" aria-label={mark} />}
		</>
	);
	if (!onPress)
		return (
			<span
				role="img"
				className="color-dot"
				aria-label={says === undefined ? name : `${name}: ${says}`}
				{...(says === undefined ? {} : { title: says })}
			>
				{parts}
			</span>
		);
	return (
		<button
			ref={buttonRef}
			type="button"
			className="color-dot"
			aria-label={`Change ${name}`}
			{...(says === undefined ? {} : { 'aria-description': says, title: says })}
			{...(popup ? { 'aria-haspopup': 'dialog', 'aria-expanded': popup.open } : {})}
			onClick={onPress}
		>
			{parts}
		</button>
	);
};
