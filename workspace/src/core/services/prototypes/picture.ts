/**
 * A comment's picture rides inside the comment, and GitHub allows 65,536 characters in a comment. Every failure here
 * means "no picture", never "no comment".
 */

/** The first step's encoding that fits `maxBytes`, or null when none does or one cannot be made. */
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
		// Every failure here means no picture.
	}
	return null;
};

export const jpegDataUrl = (jpeg: Buffer): string => `data:image/jpeg;base64,${jpeg.toString('base64')}`;
