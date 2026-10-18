import { beforeEach, describe, expect, it } from 'vitest';
import { drawSpecimens } from '../src/page/specimens';

/**
 * A type specimen, drawn by the preview page (R3 of the design system plan): in the page the design system's own CSS loads
 * its fonts in, so a family is shown in itself or said plainly not to be there, never shown in another that looks right.
 * The page's own code (`page/specimens.ts`), run here as the page runs it.
 */

type Draw = (lines: unknown[], into?: HTMLElement) => Promise<void>;
let draw: Draw;
beforeEach(() => {
	document.body.innerHTML = '<div id="root"></div>';
	Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
	draw = drawSpecimens as Draw;
});
const sections = () => [...document.querySelectorAll<HTMLElement>('[data-specimen]')];

describe('a type specimen', () => {
	it('draws a sample of each line in its own family, size, weight and line height, named with them', async () => {
		await draw([{ key: 'h1', label: 'h1', family: '"Inter",sans-serif', size: '96px', weight: '300', lineHeight: '1.167' }]);
		const [h1] = sections();
		expect(h1!.getAttribute('data-specimen')).toBe('h1');
		expect(h1!.querySelector('.fd-name')!.textContent).toBe('h1 · 96px · weight 300 · line height 1.167');
		const sample = h1!.querySelector<HTMLElement>('[data-sample]')!;
		expect(sample.textContent).toBe('The quick brown fox jumps over the lazy dog');
		expect(sample.style.fontFamily).toBe('"Inter", sans-serif');
		expect(sample.style.fontSize).toBe('96px');
		expect(sample.style.fontWeight).toBe('300');
		expect(sample.style.lineHeight).toBe('1.167');
	});

	it('leaves a part it is not given to the page, setting nothing for it', async () => {
		await draw([{ key: 'base', label: 'base fontFamily', family: 'Inter' }]);
		const sample = sections()[0]!.querySelector<HTMLElement>('[data-sample]')!;
		expect(sample.style.fontSize).toBe('');
		expect(sample.style.fontWeight).toBe('');
		expect(sections()[0]!.querySelector('.fd-name')!.textContent).toBe('base fontFamily');
	});

	it('says when a family is not there, so a sample in a fallback is never taken for the real one', async () => {
		// In this page no font is measured, so a named family is never seen to be there.
		await draw([{ key: 'base', label: 'base', family: '"Inter",sans-serif' }]);
		expect(sections()[0]!.textContent).toContain('Inter is not available here: shown in a fallback.');
	});

	it('takes a family a browser always has for being there, and says nothing of it', async () => {
		await draw([{ key: 'mono', label: 'mono', family: 'monospace' }]);
		expect(sections()[0]!.textContent).not.toContain('not available');
	});

	it('draws into the page, not over the stories’ root', async () => {
		await draw([{ key: 'a', label: 'a' }]);
		expect(document.getElementById('root')!.children).toHaveLength(0);
		expect(sections()).toHaveLength(1);
	});
});
