import { INK } from '../shared/pageInk';

/** `box` is the region painted in the capture; `left`, `top` are where it goes on the white picture of `width` by `height`. */
export interface Placed {
	box: { x: number; y: number; width: number; height: number };
	width: number;
	height: number;
	left: number;
	top: number;
}

/** `png` and the result are base64; the result is at most `most` pixels across. */
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
	g.fillStyle = INK.paper;
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
 * False, with nothing changed, when something draws outside the stories (a dialog in its own layer) or something fixed would
 * move. Undone by `pictured`.
 */
export const readyToPicture = ({ cut, dx, dy, width, height }: { cut: boolean; dx: number; dy: number; width: number; height: number }): boolean => {
	const root = document.getElementById('root') as HTMLElement;
	const drawsOutside = (e: Element) =>
		e !== root && e.tagName !== 'SCRIPT' && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().width > 0;
	if (Array.from(document.body.children).some(drawsOutside)) return false;
	// Only the root's descendants move; a file whose stories could not be drawn holds only its error and is pictured all the same.
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

export const pictured = (): void => {
	const root = document.getElementById('root') as HTMLElement;
	root.style.clipPath = '';
	root.style.translate = '';
};
