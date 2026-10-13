import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

describe('what the shared files say about one tool', () => {
	const root = join(__dirname, '../..');
	const skills = readdirSync(join(root, 'skills'))
		.filter((f) => f.endsWith('.md'))
		.map((f) => ({ file: `skills/${f}`, text: readFileSync(join(root, 'skills', f), 'utf8') }));

	it('never makes a skill one only Claude Code can start: "from an agent", not "from Claude Code"', () => {
		expect(skills.filter(({ text }) => /from Claude Code/.test(text)).map((s) => s.file)).toEqual([]);
		// A title is what a skill is called wherever it is listed.
		expect(skills.filter(({ text }) => /^# .*Claude Code/.test(text)).map((s) => s.file)).toEqual([]);
	});

	it('says the ask tool once, with what any other agent does in its place', () => {
		const workflow = read('dsnr.md');
		expect(workflow).toMatch(/AskUserQuestion/);
		expect(workflow).toMatch(/another agent[^.]*plain question/i);
	});

	it('runs the reviewers as subagents only where there are subagents, and says what to do otherwise', () => {
		const handoff = skills.find((s) => s.file === 'skills/handoff.md')?.text ?? '';
		expect(handoff).toMatch(/[Ww]here (the agent runs )?subagents/);
		expect(handoff).toMatch(/not available, read each definition/);
	});
});
