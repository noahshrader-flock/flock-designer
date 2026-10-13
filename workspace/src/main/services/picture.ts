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

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * The part of the page to capture so the picture frames the *element* the comment is about: its own box with some
 * room around it, never smaller than a readable size, never larger than a screenful, and kept inside the page.
 * A subtext line gives a wide, short picture of the line in its surroundings; a whole section, chosen as a
 * container, gives the section (smaller on the page, so less detailed, but showing the layout).
 */
export const frameRect = (
	box: Box,
	view: { width: number; height: number },
	pad = 24,
	min = { width: 200, height: 120 },
	max = { width: 800, height: 500 },
): Box => {
	const width = Math.max(1, Math.min(Math.max(box.width + pad * 2, min.width), max.width, Math.round(view.width)));
	const height = Math.max(1, Math.min(Math.max(box.height + pad * 2, min.height), max.height, Math.round(view.height)));
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	const x = Math.max(0, Math.min(Math.round(cx - width / 2), Math.round(view.width) - width));
	const y = Math.max(0, Math.min(Math.round(cy - height / 2), Math.round(view.height) - height));
	return { x, y, width, height };
};

/**
 * The image as a JPEG within `maxBytes`: `steps` are a width and a quality each, tried in order, and the first that fits is
 * kept, so it is no smaller than it has to be. Null when none fits, or the image is empty or cannot be encoded: never a
 * picture over budget. A comment's picture and a prototype's both are made this way, each with its own steps.
 */
export const fitJpeg = (image: Capturable, maxBytes: number, steps: ReadonlyArray<readonly [width: number, quality: number]>): Buffer | null => {
	try {
		if (image.isEmpty()) return null;
		// Each width is resized to once, for all its qualities.
		let at = 0;
		let resized = image;
		for (const [width, quality] of steps) {
			if (width !== at) [at, resized] = [width, image.resize({ width, quality: 'good' })];
			const jpeg = resized.toJPEG(quality);
			if (jpeg.length > 0 && jpeg.length <= maxBytes) return jpeg;
		}
	} catch {
		// A picture that cannot be taken is no picture.
	}
	return null;
};

/**
 * The same, where each step is its own encoding (`encode`, at a width and a quality, as a headless browser's screenshot
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

/** A comment's steps: each width, at each quality, before the next width. */
const COMMENT_STEPS = WIDTHS.flatMap((w) => QUALITIES.map((q) => [w, q] as const));

/** A JPEG as a data URL, which is how every picture reaches the window. */
export const jpegDataUrl = (jpeg: Buffer): string => `data:image/jpeg;base64,${jpeg.toString('base64')}`;

/** A data URL for the image, as small as it needs to be to fit, or null if it cannot be made to fit. */
export const toPicture = (image: Capturable, maxBytes = MAX_PICTURE_BYTES): string | null => {
	const jpeg = fitJpeg(image, maxBytes, COMMENT_STEPS);
	return jpeg === null ? null : jpegDataUrl(jpeg);
};
