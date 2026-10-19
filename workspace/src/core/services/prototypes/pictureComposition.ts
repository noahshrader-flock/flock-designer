/**
 * A component's picture: what its story painted, found from the pixels so nothing is assumed of its elements, centered on a
 * white canvas twice as wide as tall (a card cover's shape). A story that painted nothing has no picture, not a blank one.
 * Pixels are 4 bytes each, RGBA, as `png.ts` decodes them.
 */

export interface Bitmap {
	data: Buffer;
	width: number;
	height: number;
}

/** The room kept around what the story painted, and the least a picture is across, in pixels (the page is drawn at twice). */
const MARGIN = 24;
const LEAST = 960;

/** Whether a pixel is paint: not white, as the page behind the stories is, to the eye. */
const isPaint = (p: number): boolean => {
	const [r, g, b, a] = [p & 0xff, (p >>> 8) & 0xff, (p >>> 16) & 0xff, p >>> 24];
	return a < 255 || r < 248 || g < 248 || b < 248;
};

/** The smallest box around the pixels that are paint, or null when there are none. */
export const painted = ({ data, width, height }: Bitmap): { x: number; y: number; width: number; height: number } | null => {
	const pixels = new Uint32Array(data.buffer, data.byteOffset, Math.floor(data.length / 4));
	let [left, top, right, bottom] = [width, height, -1, -1];
	for (let y = 0; y < height; y++) {
		const row = y * width;
		for (let x = 0; x < width; x++) {
			if (pixels[row + x] === 0xffffffff || !isPaint(pixels[row + x] as number)) continue;
			if (x < left) left = x;
			if (x > right) right = x;
			if (y < top) top = y;
			bottom = y;
		}
	}
	return right < 0 ? null : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
};

/**
 * Where the picture puts what `capture` painted (its `box`): its size, twice as wide as it is tall, and the box's place in
 * it, centered; null when it painted nothing. For a shell that draws the picture itself (a browser's canvas).
 */
export const placeOnWhite = (capture: Bitmap): Placed | null => {
	const box = painted(capture);
	return box === null ? null : placeAround(box);
};

/** What the story painted (`box`), the picture's size, and the box's place in it. */
export type Placed = { box: NonNullable<ReturnType<typeof painted>>; width: number; height: number; left: number; top: number };

/** Where the picture puts a painted `box`: wide enough for it and its room, twice as wide as it is tall, the box centered. */
export const placeAround = (box: Placed['box']): Placed => {
	// Wide enough for it and its room, and tall enough that the half of that width holds it too.
	const width = Math.ceil(Math.max(LEAST, box.width + 2 * MARGIN, 2 * (box.height + 2 * MARGIN)) / 2) * 2;
	const height = width / 2;
	return { box, width, height, left: Math.floor((width - box.width) / 2), top: Math.floor((height - box.height) / 2) };
};

/** The picture: what `capture` painted, centered on white, twice as wide as it is tall; null when it painted nothing. */
export const composeOnWhite = (capture: Bitmap): Bitmap | null => {
	const place = placeOnWhite(capture);
	if (place === null) return null;
	const { box, width, height, left, top } = place;
	const data = Buffer.alloc(width * height * 4, 0xff);
	for (let y = 0; y < box.height; y++) {
		const from = ((box.y + y) * capture.width + box.x) * 4;
		capture.data.copy(data, ((top + y) * width + left) * 4, from, from + box.width * 4);
	}
	return { data, width, height };
};

/** All of how a picture is composed, for the fingerprint of how pictures are taken (`PICTURE_RECIPE`). */
export const COMPOSITION = `${isPaint}${painted}${placeOnWhite}${placeAround}${composeOnWhite}${[MARGIN, LEAST]}`;
