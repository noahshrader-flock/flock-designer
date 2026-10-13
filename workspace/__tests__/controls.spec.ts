import { describe, expect, it } from 'vitest';
import { windowSources } from './windowSources';

/**
 * Where shadcn has the control, the window uses it rather than building one: a split button is a ButtonGroup, a row of
 * choices a ToggleGroup, a badge's look a Badge, a card of content or a choice in a list an Item. Held by reading every
 * screen for the hand-built versions.
 */

describe('controls shadcn has', () => {
	it('join buttons with a ButtonGroup, not by taking their corners off by hand', () => {
		const own = windowSources().filter(({ text }) => /rounded-[lr]-none|border-l-0/.test(text));
		expect(own.map((f) => f.path)).toEqual([]);
	});

	it('mark a pressed choice in a ToggleGroup, not a raw button with aria-pressed', () => {
		const own = windowSources().filter(({ text }) => /<button\b[^>]*aria-pressed/.test(text));
		expect(own.map((f) => f.path)).toEqual([]);
	});

	it('take a badge’s look from Badge, never by pasting its classes into another element', () => {
		const own = windowSources().filter(({ text }) => /\$\{badgeVariants\(/.test(text));
		expect(own.map((f) => f.path)).toEqual([]);
	});

	it('draw a list of choices as Items, not outline buttons made into tiles', () => {
		const own = windowSources().filter(({ text }) => /<Button\b[^>]*variant="outline"[^>]*className="h-auto justify-start/.test(text));
		expect(own.map((f) => f.path)).toEqual([]);
	});

	it('draw a comment as an Item, not a bordered box of its own', () => {
		const own = windowSources().filter(({ path, text }) => path.endsWith('CommentList.tsx') && /className=\{`rounded-lg border p-3/.test(text));
		expect(own.map((f) => f.path)).toEqual([]);
	});
});

describe('a comment’s card', () => {
	it('stops no clicks: choosing a comment is a button of its own, so nothing on the card has to keep from choosing it', () => {
		const own = windowSources().filter(({ path, text }) => path.includes('/comments/') && /stopPropagation/.test(text));
		expect(own.map((f) => f.path)).toEqual([]);
	});
});

describe('classes', () => {
	it('are joined with cn(), never a template string, so one given by a caller or a condition merges as it should', () => {
		const own = windowSources().filter(({ text }) => /className=\{`/.test(text));
		expect(own.map((f) => f.path)).toEqual([]);
	});
});
