import { Icon } from './Icon';

/**
 * What a picture that opens something wears while it is hovered or focused: a wash of the brand (90%) with a white eye at
 * its centre, over the picture and nothing else. It is the stylesheet's to show (`.thumb-mark`), and is there only in a row or
 * a card that opens, so a picture that opens nothing is never marked.
 */
export const ThumbMark = () => (
	<span aria-hidden="true" className="thumb-mark">
		<Icon name="eye" />
	</span>
);
