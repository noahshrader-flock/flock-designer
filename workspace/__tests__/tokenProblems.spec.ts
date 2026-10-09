// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { TokenProblems } from '../src/renderer/TokenProblems';
import type { TokenProblem } from '../src/shared/contract';
import { button, press, render, settle, unmountAll } from './reviewHarness';

/**
 * What the library has that DSNR could not read (T2 of the design system plan), told beside Sync as one small line, and
 * in a dialog, shadcn's own, when it is pressed: each with its file and line, so the Design System tab's panel keeps its room.
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

	it('is one small button saying how many, in a warning color, and singular for one', async () => {
		await show(PROBLEMS);
		expect(button('3 values couldn’t be read').getAttribute('data-variant')).toBe('ghost');
		expect(button('3 values couldn’t be read').className.split(' ')).toContain('text-warning');
		await unmountAll(current!.root);
		await show(PROBLEMS.slice(0, 1));
		expect(button('1 value couldn’t be read')).toBeTruthy();
	});

	it('opens a dialog on a press, saying what it is and listing each with its file and line', async () => {
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
