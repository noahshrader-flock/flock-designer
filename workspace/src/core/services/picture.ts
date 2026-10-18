/**
 * Pictures as JPEGs that fit a budget: a comment's picture rides inside the comment (a hidden part, like the position), so
 * there is still one store and nothing to write anywhere else. GitHub allows 65,536 characters in a comment. A picture is a
 * convenience for whoever reads it, so every failure here means "no picture", never "no comment".
 */

/**
 * An image as a JPEG within `maxBytes`, where each step is its own encoding (`encode`, at a width and a quality, as a headless browser's screenshot
 * is): the first that fits is kept, and none when none does, or one cannot be made.
 */
export const fitJpegBy = async (
	encode: (width: number, quality: number) => Promise<Buffer>,
	maxBytes: number,
	steps: ReadonlyArray<readonly [width: number, quality: number]>,
): Promise<Buffer | null> => {
	try {
		for (const [width, quality] of steps) {
			const jpeg = await encode(width, quality);
			if (jpeg.length > 0 && jpeg.length <= maxBytes) return jpeg;
		}
	} catch {
		// A picture that cannot be taken is no picture.
	}
	return null;
};

/** A JPEG as a data URL, which is how every picture reaches the window. */
export const jpegDataUrl = (jpeg: Buffer): string => `data:image/jpeg;base64,${jpeg.toString('base64')}`;
