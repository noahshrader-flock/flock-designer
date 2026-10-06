/**
 * The small picture that goes with a comment: the spot, cropped from the page at the moment of
 * the click, before any pin is drawn.
 *
 * It rides inside the comment (a hidden part, like the position), so there is still one store and
 * nothing to write anywhere else. GitHub allows 65,536 characters in a comment; a picture this
 * size is about a quarter of that. It is a convenience for whoever reads the comment, so every
 * failure here means "no picture", never "no comment".
 */

/** The slice of Electron's NativeImage this needs, so it can be tested without Electron. */
export interface Capturable {
	isEmpty(): boolean;
	resize(options: { width: number; quality?: 'good' | 'better' | 'best' }): Capturable;
	toJPEG(quality: number): Buffer;
}

export const MAX_PICTURE_BYTES = 12_000;
/** Widths tried in order, and for each, JPEG qualities: the first that fits is used. */
const WIDTHS = [240, 200, 160, 120];
const QUALITIES = [75, 60, 45, 30];

/** The part of the page to capture: a window around the click, kept inside the page. */
export const cropRect = (
	at: { x: number; y: number },
	view: { width: number; height: number },
	size = { width: 480, height: 300 },
): { x: number; y: number; width: number; height: number } => {
	const width = Math.max(1, Math.min(size.width, Math.round(view.width)));
	const height = Math.max(1, Math.min(size.height, Math.round(view.height)));
	const x = Math.max(0, Math.min(Math.round(at.x - width / 2), Math.round(view.width) - width));
	const y = Math.max(0, Math.min(Math.round(at.y - height / 2), Math.round(view.height) - height));
	return { x, y, width, height };
};

/** A data URL for the image, as small as it needs to be to fit, or null if it cannot be made to fit. */
export const toPicture = (image: Capturable, maxBytes = MAX_PICTURE_BYTES): string | null => {
	try {
		if (image.isEmpty()) return null;
		for (const width of WIDTHS) {
			const resized = image.resize({ width, quality: 'good' });
			for (const quality of QUALITIES) {
				const jpeg = resized.toJPEG(quality);
				if (jpeg.length > 0 && jpeg.length <= maxBytes) return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
			}
		}
	} catch {
		// A picture that cannot be taken is a comment without one.
	}
	return null;
};
