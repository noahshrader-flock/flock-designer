import { describe, expect, it } from 'vitest';
import { type Capturable, MAX_PICTURE_BYTES, cropRect, fitJpeg, frameRect, toPicture } from '../src/main/services/picture';

/** An image whose JPEG size is predictable: width times quality, in bytes. */
const image = (
	over: Partial<{ empty: boolean; bytes: (w: number, q: number) => number; throws: boolean }> = {},
): Capturable & { tried: string[] } => {
	const tried: string[] = [];
	const make = (width: number): Capturable => ({
		isEmpty: () => over.empty === true,
		resize: ({ width: w }) => make(w),
		toJPEG: (q) => {
			if (over.throws) throw new Error('no');
			tried.push(`${width}@${q}`);
			return Buffer.alloc((over.bytes ?? ((w, qq) => w * qq))(width, q), 1);
		},
	});
	return Object.assign(make(480), { tried });
};

describe('toPicture', () => {
	it('uses the first width and quality that fits, and does not go smaller than it has to', () => {
		const img = image();
		const url = toPicture(img) as string;
		expect(url).toMatch(/^data:image\/jpeg;base64,/);
		// 240 wide: quality 75 is 18,000 bytes and 60 is 14,400, both too big; 45 is 10,800.
		expect(img.tried).toEqual(['240@75', '240@60', '240@45']);
		expect(Buffer.from(url.split(',')[1] as string, 'base64').length).toBe(10_800);
	});

	it('steps down to a narrower picture when no quality fits', () => {
		const url = toPicture(image({ bytes: (w) => (w <= 160 ? 5_000 : 50_000) }));
		expect(Buffer.from((url as string).split(',')[1] as string, 'base64').length).toBe(5_000);
	});

	it('gives no picture, rather than an oversized one, when nothing fits', () => {
		expect(toPicture(image({ bytes: () => MAX_PICTURE_BYTES + 1 }))).toBeNull();
	});

	it('never returns more than the cap', () => {
		const url = toPicture(image()) as string;
		expect(Buffer.from(url.split(',')[1] as string, 'base64').length).toBeLessThanOrEqual(MAX_PICTURE_BYTES);
	});

	it('gives none for an empty capture, and none if the image cannot be encoded', () => {
		expect(toPicture(image({ empty: true }))).toBeNull();
		expect(toPicture(image({ throws: true }))).toBeNull();
		expect(toPicture(image({ bytes: () => 0 }))).toBeNull();
	});
});

describe('cropRect', () => {
	const view = { width: 1000, height: 700 };

	it('centers on the click', () => {
		expect(cropRect({ x: 500, y: 350 }, view)).toEqual({ x: 260, y: 200, width: 480, height: 300 });
	});

	it('stays inside the page near an edge, keeping its size', () => {
		expect(cropRect({ x: 5, y: 5 }, view)).toEqual({ x: 0, y: 0, width: 480, height: 300 });
		expect(cropRect({ x: 995, y: 695 }, view)).toEqual({ x: 520, y: 400, width: 480, height: 300 });
	});

	it('shrinks to a page smaller than the window it would like', () => {
		expect(cropRect({ x: 100, y: 50 }, { width: 300, height: 120 })).toEqual({ x: 0, y: 0, width: 300, height: 120 });
	});

	it('never produces an empty or negative rectangle, even for nonsense', () => {
		const r = cropRect({ x: -50, y: 9e9 }, { width: 0, height: 0 });
		expect(r.width).toBeGreaterThanOrEqual(1);
		expect(r.height).toBeGreaterThanOrEqual(1);
		expect(r.x).toBeGreaterThanOrEqual(0);
		expect(r.y).toBeGreaterThanOrEqual(0);
	});
});

describe('frameRect', () => {
	const view = { width: 1200, height: 800 };

	it('frames a line of text in its surroundings: wide, and as short as is readable', () => {
		expect(frameRect({ x: 100, y: 400, width: 600, height: 20 }, view)).toEqual({ x: 76, y: 350, width: 648, height: 120 });
	});

	it('gives a tiny element a readable minimum, centered on it', () => {
		const r = frameRect({ x: 500, y: 300, width: 10, height: 10 }, view);
		expect([r.width, r.height]).toEqual([200, 120]);
		expect(r.x + r.width / 2).toBeCloseTo(505, 0);
	});

	it('shows a whole section, up to a screenful, when a container was chosen', () => {
		const r = frameRect({ x: 0, y: 0, width: 1200, height: 800 }, view);
		expect([r.width, r.height]).toEqual([800, 500]);
	});

	it('stays inside the page next to an edge, keeping its size', () => {
		expect(frameRect({ x: 0, y: 0, width: 50, height: 20 }, view)).toMatchObject({ x: 0, y: 0, width: 200, height: 120 });
		expect(frameRect({ x: 1190, y: 790, width: 10, height: 10 }, view)).toMatchObject({ x: 1000, y: 680 });
	});

	it('never exceeds a page smaller than it would like, and never goes empty', () => {
		expect(frameRect({ x: 0, y: 0, width: 100, height: 100 }, { width: 150, height: 90 })).toEqual({ x: 0, y: 0, width: 150, height: 90 });
		const r = frameRect({ x: 5, y: 5, width: 0, height: 0 }, { width: 0, height: 0 });
		expect(r.width).toBeGreaterThanOrEqual(1);
		expect(r.height).toBeGreaterThanOrEqual(1);
	});
});

describe('fitJpeg', () => {
	// The project pictures' steps: each a width and a quality, tried in order, the first that fits kept.
	const STEPS: Array<[number, number]> = [
		[960, 80],
		[960, 70],
		[720, 70],
		[640, 60],
	];

	it('keeps the first step that fits the budget, and goes no smaller than it has to', () => {
		const img = image({ bytes: (w, q) => w * q });
		// 960 at 80 is 76,800 bytes and at 70 is 67,200; 720 at 70 is 50,400, inside 60,000.
		const jpeg = fitJpeg(img, 60_000, STEPS) as Buffer;
		expect(img.tried).toEqual(['960@80', '960@70', '720@70']);
		expect(jpeg.length).toBe(50_400);
	});

	it('is nothing when no step fits, or the image is empty, or it cannot be encoded: never a picture over budget', () => {
		expect(fitJpeg(image({ bytes: () => 100_000 }), 48_000, STEPS)).toBeNull();
		expect(fitJpeg(image({ empty: true }), 48_000, STEPS)).toBeNull();
		expect(fitJpeg(image({ throws: true }), 48_000, STEPS)).toBeNull();
	});
});
