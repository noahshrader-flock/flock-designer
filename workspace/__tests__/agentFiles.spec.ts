import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The shared agent files, and what they say to any agent (09, "any agent"). `agents/ui-guide.md` is how to build UI in a
 * Flock product, true in whatever tool it is done; `agents/dsnr.md` is DSNR's own workflow on top of it. Each rule is in
 * one of the two, and the guide never speaks of DSNR's workflow or one tool's mechanics, so an agent that is not DSNR's
 * can read it whole.
 */

const agents = join(__dirname, '../../agents');
const read = (name: string) => (existsSync(join(agents, name)) ? readFileSync(join(agents, name), 'utf8') : '');
const headings = (text: string) => [...text.matchAll(/^#{2,3} (.+)$/gm)].map((m) => (m[1] ?? '').trim());

describe('the guide for building UI', () => {
	const guide = read('ui-guide.md');
	const workflow = read('dsnr.md');

	it('exists, and DSNR’s workflow starts from it', () => {
		expect(guide).not.toBe('');
		expect(workflow).toContain('ui-guide.md');
	});

	it('speaks of none of DSNR’s workflow or one tool’s mechanics: it is for any agent', () => {
		const forbidden = [
			/context[- ]receipt/i,
			/projects\/</,
			/AskUserQuestion/,
			/NEEDS PATH/,
			/Build in the codebase/,
			/\.claude\//,
			/\bprototype path\b/i,
			/\bcodebase path\b/i,
		];
		expect(forbidden.filter((re) => re.test(guide)).map(String)).toEqual([]);
	});

	it('names no one product: it holds for every product that adopts it', () => {
		expect(guide).not.toMatch(/\bCoke\b|\bCrown\b|\bMonaco\b/);
	});

	it('shares no section with the workflow: each rule is said in one of the two', () => {
		const both = headings(guide).filter((h) => headings(workflow).includes(h));
		expect(both).toEqual([]);
	});
});
