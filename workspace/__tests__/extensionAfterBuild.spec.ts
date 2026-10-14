import { describe, expect, it, vi } from 'vitest';
import { checkBuilt } from '../extension/src/afterBuild';
import type { AccessibilityResult } from '../src/shared/contract';
import { ok } from '../src/shared/result';

/**
 * What DSNR does itself once a prototype Claude Code built is saved, so it does not depend on the agent: its accessibility
 * check, run here, and what it found said to the person, with the fix handed back to Claude Code when they ask. Never a
 * pass: at most, no issues found by automated checks.
 */

const result = (rules: string[]): AccessibilityResult => ({
	ran: { axe: '4.10', tags: ['wcag2a'], target: 'WCAG 2.2 Level AA', declared: true, at: '2026-10-14T00:00:00Z', states: ['default'] },
	violations: rules.map((rule) => ({ rule, help: `${rule} help`, impact: 'serious', criteria: ['1.1.1'], nodes: 2, url: '', states: ['default'] })),
	incomplete: [],
	notAutomated: [],
});

const world = (found: AccessibilityResult | { error: string }, choose: string | undefined = undefined) => {
	const told: string[] = [];
	const offered: { message: string; actions: string[] }[] = [];
	const api = {
		checkAccessibility: vi.fn(async () => ('error' in found ? { ok: false as const, error: found.error } : ok(found))),
		handPrototypeFix: vi.fn(async () => ok({ editor: true, command: null })),
	};
	const deps = {
		api,
		root: '/p',
		projectId: 'build-a',
		name: 'v1-i1',
		title: 'Build A',
		tell: (m: string) => void told.push(m),
		offer: vi.fn(async (message: string, actions: string[]) => {
			offered.push({ message, actions });
			return choose;
		}),
	};
	return { deps, api, told, offered };
};

describe('after a prototype Claude Code built is saved', () => {
	it('runs its accessibility check here, and says what it found, never that it passed', async () => {
		const w = world(result([]));
		await checkBuilt(w.deps);
		expect(w.api.checkAccessibility).toHaveBeenCalledWith('build-a', 'v1-i1');
		expect(w.told).toEqual([
			'Build A is saved. Its accessibility check found no issues by automated checks (WCAG 2.2 Level AA); that is not a full review.',
		]);
		expect(w.told[0]).not.toMatch(/pass/i);
	});

	it('says how many issues and which, and offers to fix them in Claude Code', async () => {
		const w = world(result(['image-alt', 'color-contrast', 'label', 'list']));
		await checkBuilt(w.deps);
		expect(w.offered).toHaveLength(1);
		expect(w.offered[0]!.message).toBe(
			'Build A is saved. Its accessibility check found 4 issues (WCAG 2.2 Level AA): image-alt, color-contrast, label and 1 more.',
		);
		expect(w.offered[0]!.actions).toEqual(['Fix in Claude Code']);
		expect(w.api.handPrototypeFix).not.toHaveBeenCalled();
	});

	it('hands the fix to Claude Code when asked, and says where it went', async () => {
		const w = world(result(['image-alt']), 'Fix in Claude Code');
		await checkBuilt(w.deps);
		expect(w.api.handPrototypeFix).toHaveBeenCalledWith('/p', 'build-a', 'v1-i1');
		expect(w.told.at(-1)).toContain('in Claude Code in this window now');
		const elsewhere = world(result(['image-alt']), 'Fix in Claude Code');
		elsewhere.api.handPrototypeFix.mockResolvedValue(ok({ editor: false, command: 'cd /p && claude x' }) as never);
		await checkBuilt(elsewhere.deps);
		expect(elsewhere.told.at(-1)).toContain('on your clipboard');
	});

	it('says when the check could not run, as a check not run, with why', async () => {
		const w = world({ error: 'This prototype has no page yet.' });
		await checkBuilt(w.deps);
		expect(w.told).toEqual(['Build A is saved. Its accessibility check was not run: This prototype has no page yet.']);
	});

	it('says when the fix could not be handed over, rather than failing quietly', async () => {
		const w = world(result(['image-alt']), 'Fix in Claude Code');
		w.api.handPrototypeFix.mockResolvedValue({ ok: false, error: 'The accessibility check found nothing to fix.' } as never);
		await checkBuilt(w.deps);
		expect(w.told.at(-1)).toBe('The fix for Build A was not handed over: The accessibility check found nothing to fix.');
	});
});
