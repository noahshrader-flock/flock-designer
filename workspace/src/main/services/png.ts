import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Paeth's predictor, as the PNG format defines it for its fourth filter. */
const paeth = (a: number, b: number, c: number): number => {
	const p = a + b - c;
	const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)];
	return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * A PNG's pixels, four bytes each (red, green, blue, alpha), for what needs to look at them (`isBlank`) where there is no
 * image library: a headless browser's screenshot. Only what a browser writes: 8 bits a channel, RGB or RGBA, not
 * interlaced; anything else throws.
 */
export const decodePng = (png: Buffer): { width: number; height: number; rgba: Uint8Array } => {
	if (png.length < 8 || !png.subarray(0, 8).equals(SIGNATURE)) throw new Error('That is not a PNG.');
	let width = 0;
	let height = 0;
	let channels = 0;
	const data: Buffer[] = [];
	for (let at = 8; at + 8 <= png.length;) {
		const length = png.readUInt32BE(at);
		const type = png.toString('latin1', at + 4, at + 8);
		const body = png.subarray(at + 8, at + 8 + length);
		if (type === 'IHDR') {
			width = body.readUInt32BE(0);
			height = body.readUInt32BE(4);
			const [depth, color, , , interlace] = body.subarray(8, 13);
			if (depth !== 8 || (color !== 2 && color !== 6) || interlace !== 0) throw new Error('That PNG is not one a browser writes.');
			channels = color === 6 ? 4 : 3;
		} else if (type === 'IDAT') data.push(body);
		else if (type === 'IEND') break;
		at += 12 + length;
	}
	if (channels === 0) throw new Error('That is not a PNG.');
	const raw = inflateSync(Buffer.concat(data));
	const stride = width * channels;
	const rgba = new Uint8Array(width * height * 4);
	let prev = new Uint8Array(stride);
	for (let y = 0; y < height; y++) {
		const filter = raw[y * (stride + 1)] as number;
		const line = new Uint8Array(stride);
		for (let x = 0; x < stride; x++) {
			const v = raw[y * (stride + 1) + 1 + x] as number;
			const a = x >= channels ? (line[x - channels] as number) : 0;
			const b = prev[x] as number;
			const c = x >= channels ? (prev[x - channels] as number) : 0;
			const predicted = filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? paeth(a, b, c) : 0;
			line[x] = (v + predicted) & 255;
		}
		for (let i = 0; i < width; i++) {
			rgba.set(line.subarray(i * channels, i * channels + 3), (y * width + i) * 4);
			rgba[(y * width + i) * 4 + 3] = channels === 4 ? (line[i * channels + 3] as number) : 255;
		}
		prev = line;
	}
	return { width, height, rgba };
};
