import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { moveToCodeTask } from '../src/main/services/prototype';

const SKILLS = join(__dirname, '../../skills');
const skill = (name: string): string => readFileSync(join(SKILLS, name), 'utf8');

/**
 * The task each skill is given in, built from the real skill. A skill that says another file is "in your task" is
 * believed by the agent; when it is not there, the agent works without it and never knows.
 */
const TASKS: Record<string, (text: string) => string> = {
	'move-to-code.md': (text) =>
		moveToCodeTask({ skill: text, pageFile: '/p/i1.html', auditFile: '/d/audit-i1.md', name: 'i1', accessibility: '', voice: '', lightCheck: null, shared: '' }),
};

/** Every `file.md` a skill says is in the task, in the same sentence. */
const claimed = (text: string): string[] => [...text.matchAll(/`([\w./-]+\.md)`[^`.\n]{0,40}\bin (?:your|the) task\b/g)].map((m) => m[1] as string);

describe('what a skill says is in its task', () => {
	const withClaims = readdirSync(SKILLS)
		.filter((f) => f.endsWith('.md'))
		.map((f) => [f, claimed(skill(f))] as const)
		.filter(([, files]) => files.length > 0);

	it.each(withClaims.length ? withClaims : [['(none)', []] as const])('is there, for %s', (name, files) => {
		if (!files.length) return;
		const build = TASKS[name];
		expect(build, `${name} says ${files.join(', ')} is in its task: add the task it is given in to TASKS`).toBeDefined();
		const task = build?.(skill(name)) ?? '';
		for (const file of files) expect(task, `${name} says ${file} is in its task`).toContain(skill(file).split('\n')[0]);
	});

	it('is found when a skill says it', () => {
		expect(claimed('`codebase-work.md` (in your task too) says how it runs')).toEqual(['codebase-work.md']);
		expect(claimed('read `x.md`, beside this file')).toEqual([]);
		// "It" here is the skill itself, in the next sentence.
		expect(claimed('from Claude Code (`start-prototype.md`), so nobody has to find it. It is also in the task')).toEqual([]);
	});
});
