import { describe, expect, it } from 'vitest';
import { type Capturable, MAX_PICTURE_BYTES, cropRect, toPicture } from '../src/main/services/picture';

/** An image whose JPEG size is predictable: width times quality, in bytes. */
const image = (over: Partial<{ empty: boolean; bytes: (w: number, q: number) => number; throws: boolean }> = {}): Capturable & { tried: string[] } => {
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

	it('centres on the click', () => {
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
