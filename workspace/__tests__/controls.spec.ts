import { describe, expect, it } from 'vitest';
import { badTags, offenders, windowSources } from './windowSources';

/**
 * Where shadcn has the control, the window uses it rather than building one: a split button is a ButtonGroup, a row of
 * choices a ToggleGroup, a badge's look a Badge, a card of content or a choice in a list an Item. Held by reading every
 * screen for the hand-built versions.
 */

describe('controls shadcn has', () => {
	it('join buttons with a ButtonGroup, not by taking their corners off by hand', () => {
		expect(offenders(/rounded-[lr]-none|border-l-0/)).toEqual([]);
	});

	it('mark a pressed choice in a ToggleGroup, not a raw button with aria-pressed', () => {
		// A Button that turns a mode on and off (comment mode) is a toggle button, and says so with aria-pressed; a row of
		// raw buttons pressed one at a time is a set of choices, which is a ToggleGroup's.
		expect(badTags(/^button$/, (tag) => /aria-pressed/.test(tag))).toEqual([]);
	});

	it('take a badge’s look from Badge, never by pasting its classes into another element', () => {
		expect(offenders(/\$\{badgeVariants\(/)).toEqual([]);
	});

	it('draw a list of choices as Items, not outline buttons made into tiles', () => {
		expect(badTags(/^Button$/, (tag) => /variant="outline"/.test(tag) && /className="[^"]*h-auto[^"]*justify-start/.test(tag))).toEqual([]);
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
		expect(offenders(/className=\{`/)).toEqual([]);
	});
});
