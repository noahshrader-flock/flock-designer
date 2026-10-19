/**
 * What a picture that opens something wears while it is hovered or focused: a light wash of the brand, over the picture and
 * nothing else. It is the stylesheet's to show (`.thumb-wash`), and is there only in a row or a card that opens, so a picture
 * that opens nothing is never washed.
 */
export const ThumbWash = () => <span aria-hidden="true" className="thumb-wash" />;
