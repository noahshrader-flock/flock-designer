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

	describe('Build in the codebase checks its own work once, before it reports', () => {
		const build = skills.find((s) => s.file === 'skills/move-to-code.md')?.text ?? '';
		const section = /## Before you report[^\n]*\n([\s\S]*?)\n## /.exec(build)?.[1] ?? '';

		it('has the section, between the work and the report', () => {
			expect(section).not.toBe('');
			expect(build.indexOf('## Then: the work')).toBeLessThan(build.indexOf('## Before you report'));
			expect(build.indexOf('## Before you report')).toBeLessThan(build.indexOf('## When you have finished'));
		});

		it('asks the implementation reviewer, which is code and boundary, and leaves product parity to Handoff', () => {
			expect(section).toContain('../agents/implementation-reviewer.md');
			expect(section).toMatch(/product parity[^.]*Handoff/i);
		});

		it('runs it as a subagent where there are subagents, in the foreground, and itself where there are not, saying so', () => {
			expect(section).toMatch(/[Ww]here (the agent runs )?subagents, run it as a subagent, in the foreground/);
			expect(section).toMatch(/not available, read the definition and follow it directly, and say that you did/);
		});

		it('fixes what blocks, one commit each with the light check passing, and checks again once at most', () => {
			expect(section).toMatch(/[Ff]ix every (finding|blocking)/);
			expect(section).toMatch(/[Cc]ommit after each\s+fix/);
			expect(section).toMatch(/once more/);
			expect(section).toMatch(/still open/);
		});

		it('records a check that could not run as not run, never as a pass', () => {
			expect(section).toMatch(/not run/);
		});

		it('is in the report, which still says the full reviews and the gate are Handoff’s', () => {
			const report = build.slice(build.indexOf('## When you have finished'));
			expect(report).toMatch(/implementation check/);
			expect(report).toMatch(/Handoff/);
			expect(build).not.toMatch(/The reviews and the full checks are not this run's/);
		});

		it('is said by DSNR’s workflow too: the reviews run at Handoff, except this one check', () => {
			expect(read('dsnr.md')).toMatch(/run at Handoff[^.]*\.[^.]*Build in the codebase[^.]*one implementation check/s);
		});
	});

	it('runs the reviewers as subagents only where there are subagents, and says what to do otherwise', () => {
		const handoff = skills.find((s) => s.file === 'skills/handoff.md')?.text ?? '';
		expect(handoff).toMatch(/[Ww]here (the agent runs )?subagents/);
		expect(handoff).toMatch(/not available, read each definition/);
	});
});
