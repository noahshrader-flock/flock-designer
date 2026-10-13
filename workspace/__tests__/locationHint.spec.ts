// @vitest-environment jsdom
import { act, createElement } from 'react';
import { GitBranchIcon } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { LocationHint } from '../src/renderer/LocationHint';
import { render, settle, unmountAll } from './reviewHarness';
import { offenders } from './windowSources';

/** Where something is kept (a branch, a saved page), as an icon whose tooltip says it: reachable by keyboard, not only a mouse. */

let current: Awaited<ReturnType<typeof render>> | null = null;
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	document.body.innerHTML = '';
});

describe('where it is kept', () => {
	it('can be focused, is named by what it says, and says it in its tooltip when focused', async () => {
		current = await render(createElement(LocationHint, { icon: GitBranchIcon, label: 'Branch develop', value: 'develop' }));
		const hint = document.querySelector<HTMLElement>('[aria-label="Branch develop"]')!;
		expect(hint.tabIndex).toBe(0);
		await act(async () => hint.focus());
		await settle();
		expect([...document.querySelectorAll('[role="tooltip"]')].map((t) => t.textContent)).toContain('develop');
	});

	it('is the only tooltip on a bare icon: an icon cannot take focus, so its tooltip would need a mouse', () => {
		expect(offenders(/<TooltipTrigger asChild>\s*(\{|<\w+Icon\b)/, 'LocationHint.tsx')).toEqual([]);
	});
});
