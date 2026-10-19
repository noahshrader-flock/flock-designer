/**
 * A story's picture, made in its preview page, as the headless browser asks for it (`core/services/browser/chromeHeadless.ts`,
 * which bundles this into the scripts it runs). Page code, typed like the rest.
 */

/** Where a story's paint goes on the white picture: the box it painted, the picture's size, and where the box is put. */
export interface Placed {
	box: { x: number; y: number; width: number; height: number };
	width: number;
	height: number;
	left: number;
	top: number;
}

/**
 * The picture as JPEG, base64: the PNG captured (`png`, base64), what it painted put on white where `place` says, drawn by
 * the page's own canvas at most `most` pixels across. Only the PNG and where it goes come in, never the pixels.
 */
export const encodeJpeg = async ({
	png,
	place: p,
	most,
	quality,
}: {
	png: string;
	place: Placed;
	most: number;
	quality: number;
}): Promise<string> => {
	const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
	const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
	const scale = Math.min(1, most / p.width);
	const canvas = new OffscreenCanvas(Math.round(p.width * scale), Math.round(p.height * scale));
	const g = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
	g.fillStyle = '#fff';
	g.fillRect(0, 0, canvas.width, canvas.height);
	g.imageSmoothingQuality = 'high';
	g.drawImage(image, p.box.x, p.box.y, p.box.width, p.box.height, p.left * scale, p.top * scale, p.box.width * scale, p.box.height * scale);
	const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
	const read = new Uint8Array(await blob.arrayBuffer());
	let text = '';
	for (let i = 0; i < read.length; i += 0x8000) text += String.fromCharCode(...read.subarray(i, i + 0x8000));
	return btoa(text);
};

/**
 * Readies the page for the picture's one region: the stories clipped to what was captured (so what runs past is white, as
 * in the composition) and moved by `dx`, `dy`. False, with nothing changed, when something draws outside the stories (a
 * dialog in its own layer) or something fixed would move. Undone by `pictured`.
 */
export const readyToPicture = ({ cut, dx, dy, width, height }: { cut: boolean; dx: number; dy: number; width: number; height: number }): boolean => {
	const root = document.getElementById('root') as HTMLElement;
	const drawsOutside = (e: Element) =>
		e !== root && e.tagName !== 'SCRIPT' && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().width > 0;
	if (Array.from(document.body.children).some(drawsOutside)) return false;
	// Everything that moves is the stories' root's: a file whose stories could not be drawn at all has no story in it, only
	// what it says instead, and is pictured all the same.
	if ((dx > 0 || dy > 0) && Array.from(root.querySelectorAll('*')).some((e) => getComputedStyle(e).position === 'fixed')) return false;
	if (cut) {
		const r = root.getBoundingClientRect();
		const [l, t] = [-r.left, -r.top];
		const corners = [
			[l, t],
			[l + width, t],
			[l + width, t + height],
			[l, t + height],
		];
		root.style.clipPath = `polygon(${corners.map(([x, y]) => `${x}px ${y}px`).join(', ')})`;
	}
	root.style.translate = `${dx}px ${dy}px`;
	return true;
};

/** The stories as they were before `readyToPicture`. */
export const pictured = (): void => {
	const root = document.getElementById('root') as HTMLElement;
	root.style.clipPath = '';
	root.style.translate = '';
};
