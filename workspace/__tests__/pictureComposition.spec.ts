import { describe, expect, it } from 'vitest';
import { COMPOSITION, composeOnWhite } from '../src/core/services/pictureComposition';

/**
 * A component's picture from a capture of its page (P5 of the design system plan): what was painted, found from the
 * pixels and centered on white, twice as wide as it is tall. Against bitmaps made here, pixel by pixel.
 */

const GREEN = [0x62, 0x80, 0x10, 0xff];
/** A white capture of `width` by `height` with `paint` boxes of one color in it. */
const capture = (width: number, height: number, boxes: { x: number; y: number; w: number; h: number; color?: number[] }[]) => {
	const data = Buffer.alloc(width * height * 4, 0xff);
	for (const { x, y, w, h, color = GREEN } of boxes) {
		for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) data.set(color, (j * width + i) * 4);
	}
	return { data, width, height };
};
const pixel = ({ data, width }: { data: Buffer; width: number }, x: number, y: number) => [
	...data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4),
];
/** Where, in the picture, the paint is: its left, top, right and bottom edges. */
const paintedEdges = (picture: { data: Buffer; width: number; height: number }): [number, number, number, number] => {
	let [l, t, r, b] = [picture.width, picture.height, -1, -1];
	for (let y = 0; y < picture.height; y++)
		for (let x = 0; x < picture.width; x++)
			if (pixel(picture, x, y).some((c) => c < 248)) [l, t, r, b] = [Math.min(l, x), Math.min(t, y), Math.max(r, x), Math.max(b, y)];
	return [l, t, r + 1, b + 1];
};

describe('a picture', () => {
	it('is what the story painted, centered on white, twice as wide as it is tall', () => {
		// A 200 by 100 box, off at the top left of a bigger page, as a story is.
		const picture = composeOnWhite(capture(1200, 800, [{ x: 40, y: 30, w: 200, h: 100 }]));
		expect(picture).not.toBeNull();
		expect(picture!.width).toBe(picture!.height * 2);
		// Room on every side the same: centered, to the pixel.
		const [l, t, r, b] = paintedEdges(picture!);
		expect([r - l, b - t]).toEqual([200, 100]);
		expect([l, picture!.width - r]).toEqual([(picture!.width - 200) / 2, (picture!.width - 200) / 2]);
		expect([t, picture!.height - b]).toEqual([(picture!.height - 100) / 2, (picture!.height - 100) / 2]);
		expect(pixel(picture!, 0, 0)).toEqual([255, 255, 255, 255]);
	});

	it('is never smaller than a least width, so a small component is not stretched to fill a cover', () => {
		const picture = composeOnWhite(capture(400, 400, [{ x: 10, y: 10, w: 30, h: 30 }]))!;
		expect(picture.width).toBe(960);
		expect(paintedEdges(picture)).toEqual([465, 225, 495, 255]);
	});

	it('grows to hold a wide component and its room, and to hold a tall one at half the width', () => {
		const wide = composeOnWhite(capture(1600, 400, [{ x: 0, y: 0, w: 1500, h: 100 }]))!;
		expect(wide.width).toBe(1500 + 48);
		const tall = composeOnWhite(capture(800, 1600, [{ x: 0, y: 0, w: 300, h: 900 }]))!;
		expect([tall.width, tall.height]).toEqual([2 * (900 + 48), 900 + 48]);
		const [, t, , b] = paintedEdges(tall);
		expect([t, tall.height - b]).toEqual([24, 24]);
	});

	it('finds paint wherever it is, however spread out: the box around all of it is what is centered', () => {
		const picture = composeOnWhite(
			capture(1200, 600, [
				{ x: 500, y: 300, w: 20, h: 20 },
				{ x: 100, y: 50, w: 20, h: 20 },
			]),
		)!;
		const [l, t, r, b] = paintedEdges(picture);
		expect([r - l, b - t]).toEqual([420, 270]);
		expect([l, picture.width - r]).toEqual([(picture.width - 420) / 2, (picture.width - 420) / 2]);
	});

	it('sees a pale color as paint, and white as none: a story that painted nothing has no picture', () => {
		expect(composeOnWhite(capture(300, 300, []))).toBeNull();
		expect(composeOnWhite(capture(300, 300, [{ x: 5, y: 5, w: 10, h: 10, color: [0xf6, 0xf6, 0xf6, 0xff] }]))).not.toBeNull();
		expect(composeOnWhite(capture(300, 300, [{ x: 5, y: 5, w: 10, h: 10, color: [0xfa, 0xfa, 0xfa, 0xff] }]))).toBeNull();
	});

	it('keeps its pixels as they were: a copy of the paint, not a re-drawing', () => {
		const source = capture(500, 300, [
			{ x: 50, y: 60, w: 100, h: 40, color: [0x10, 0x80, 0x62, 0xff] },
			{ x: 60, y: 70, w: 10, h: 10, color: [0xff, 0x00, 0x00, 0xff] },
		]);
		const picture = composeOnWhite(source)!;
		const [l, t] = paintedEdges(picture);
		expect(pixel(picture, l, t)).toEqual([0x10, 0x80, 0x62, 0xff]);
		expect(pixel(picture, l + 10, t + 10)).toEqual([0xff, 0x00, 0x00, 0xff]);
	});

	it('is fingerprinted by all of how it is composed, its helpers and their numbers too, so a change to any of them is seen', () => {
		// What is paint (below 248), the room around it (24) and the least width (960).
		expect(COMPOSITION).toContain('248');
		expect(COMPOSITION).toContain('24,960');
		expect(COMPOSITION).toContain('Uint32Array');
	});
});
