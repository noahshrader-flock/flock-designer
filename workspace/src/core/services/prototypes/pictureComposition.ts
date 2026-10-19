/**
 * What a story painted is found from the pixels, so nothing is assumed of its elements; a story that painted nothing has
 * no picture, not a blank one. Pixels are 4 bytes each, RGBA, as `png.ts` decodes them.
 */

export interface Bitmap {
	data: Buffer;
	width: number;
	height: number;
}

/** In pixels; the page is drawn at twice. */
const MARGIN = 24;
const LEAST = 960;

/** Near-white counts as the page behind the stories, to the eye. */
const isPaint = (p: number): boolean => {
	const [r, g, b, a] = [p & 0xff, (p >>> 8) & 0xff, (p >>> 16) & 0xff, p >>> 24];
	return a < 255 || r < 248 || g < 248 || b < 248;
};

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

/** For a shell that draws the picture itself (a browser's canvas). */
export const placeOnWhite = (capture: Bitmap): Placed | null => {
	const box = painted(capture);
	return box === null ? null : placeAround(box);
};

export type Placed = { box: NonNullable<ReturnType<typeof painted>>; width: number; height: number; left: number; top: number };

export const placeAround = (box: Placed['box']): Placed => {
	const width = Math.ceil(Math.max(LEAST, box.width + 2 * MARGIN, 2 * (box.height + 2 * MARGIN)) / 2) * 2;
	const height = width / 2;
	return { box, width, height, left: Math.floor((width - box.width) / 2), top: Math.floor((height - box.height) / 2) };
};

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

/** The source of the composition, for the fingerprint of how pictures are taken (`PICTURE_RECIPE`). */
export const COMPOSITION = `${isPaint}${painted}${placeOnWhite}${placeAround}${composeOnWhite}${[MARGIN, LEAST]}`;
