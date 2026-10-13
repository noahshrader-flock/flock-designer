// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { TokenProblems } from '../src/renderer/TokenProblems';
import type { TokenProblem } from '../src/shared/contract';
import { button, press, render, settle, unmountAll } from './reviewHarness';

/**
 * What the library has that DSNR could not read (T2 of the design system plan), told in one small ghost button, the icon and
 * how many, that opens a dialog with each, its file and line.
 */

const PROBLEMS: TokenProblem[] = [
	{ file: 'src/colors/tones/neutral.ts', line: 10, reason: "neutral 94 is '@ECEEEB', not a hex color, so this step is not read" },
	{ file: 'src/colors/tones/neutral.ts', line: 15, reason: "neutral 70 is 'AEB0B2', not a hex color, so this step is not read" },
	{ file: 'src/colors/theme/light.ts', reason: 'src/colors/theme/light.ts could not be read' },
];

let current: Awaited<ReturnType<typeof render>> | null = null;
const show = async (problems: TokenProblem[]) => {
	current = await render(createElement(TokenProblems, { problems }));
};
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

describe('what could not be read', () => {
	it('is nothing at all when everything was read', async () => {
		await show([]);
		expect(document.body.textContent).toBe('');
	});

	it('is a small ghost button with the warning icon and how many, and nothing else: not an alert', async () => {
		await show(PROBLEMS);
		const b = button('3 values couldn’t be read');
		expect(b.getAttribute('data-variant')).toBe('ghost');
		expect(b.getAttribute('data-size')).toBe('sm');
		expect(b.querySelector('svg')).not.toBeNull();
		expect(b.textContent).toBe('3 values couldn’t be read');
		expect(document.querySelector('[role="alert"]')).toBeNull();
	});

	it('says one value in the singular', async () => {
		await show(PROBLEMS.slice(0, 1));
		expect(button('1 value couldn’t be read')).not.toBeNull();
	});

	it('opens a dialog from the button, saying what it is and listing each with its file and line', async () => {
		await show(PROBLEMS);
		expect(dialog()).toBeNull();
		await press(button('3 values couldn’t be read'));
		await settle();
		expect(dialog()?.textContent).toContain('3 values couldn’t be read');
		expect(dialog()?.textContent).toContain('The rest of the tokens are shown');
		const items = [...(dialog()?.querySelectorAll('li') ?? [])].map((li) => li.textContent);
		expect(items).toEqual([
			"src/colors/tones/neutral.ts:10neutral 94 is '@ECEEEB', not a hex color, so this step is not read",
			"src/colors/tones/neutral.ts:15neutral 70 is 'AEB0B2', not a hex color, so this step is not read",
			'src/colors/theme/light.tssrc/colors/theme/light.ts could not be read',
		]);
	});

	it('closes from its one Close button, in the footer, shadcn’s own', async () => {
		await show(PROBLEMS);
		await press(button('3 values couldn’t be read'));
		await settle();
		// One way to close, not a corner button as well.
		expect([...(dialog()?.querySelectorAll('button') ?? [])].map((b) => b.textContent)).toEqual(['Close']);
		await press(button('Close', dialog() as HTMLElement));
		await settle();
		expect(dialog()).toBeNull();
	});
});
