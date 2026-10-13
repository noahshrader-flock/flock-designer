// @vitest-environment jsdom
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { TokenProblems } from '../src/renderer/TokenProblems';
import type { TokenProblem } from '../src/shared/contract';
import { TOKEN_PROBLEM } from './fixtures';
import { button, dialog, press, render, settle, unmountAll } from './reviewHarness';

/**
 * What the library has that DSNR could not read (T2 of the design system plan): a problems button (`ProblemsDialog`) saying
 * how many, and in its dialog each with its file and line.
 */

const PROBLEMS: TokenProblem[] = [
	TOKEN_PROBLEM,
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

describe('what could not be read', () => {
	it('is nothing at all when everything was read', async () => {
		await show([]);
		expect(document.body.textContent).toBe('');
	});

	it('says how many, one in the singular', async () => {
		await show(PROBLEMS);
		expect(button('3 values couldn’t be read')).not.toBeNull();
		await unmountAll(current!.root);
		await show(PROBLEMS.slice(0, 1));
		expect(button('1 value couldn’t be read')).not.toBeNull();
	});

	it('lists each in its dialog with its file and line, and says the rest are shown', async () => {
		await show(PROBLEMS);
		await press(button('3 values couldn’t be read'));
		await settle();
		expect(dialog()?.textContent).toContain('The rest of the tokens are shown');
		const items = [...(dialog()?.querySelectorAll('li') ?? [])].map((li) => li.textContent);
		expect(items).toEqual([
			"src/colors/tones/neutral.ts:10neutral 94 is '@ECEEEB', not a hex color, so this step is not read",
			"src/colors/tones/neutral.ts:15neutral 70 is 'AEB0B2', not a hex color, so this step is not read",
			'src/colors/theme/light.tssrc/colors/theme/light.ts could not be read',
		]);
	});
});
