import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { codebaseTask, handoffTask, buildInCodebaseTask, prototypeAddressTask, prototypeBuildTask } from '../src/main/services/agentTasks';

const SKILLS = join(__dirname, '../../skills');
const skill = (name: string): string => readFileSync(join(SKILLS, name), 'utf8');

/**
 * The task each skill is given in, built from the real skill. A skill that says another file is "in your task" is
 * believed by the agent; when it is not there, the agent works without it and never knows.
 */
const parts = { guide: '', lightCheck: null, shared: '', accessibility: '', voice: '' };
const prototypeBuild = { source: '/p/i1.tsx', page: '/p/i1.html', buildCommand: 'node build' };
const sources = {
	code: '/p/code',
	productGuidance: null,
	designSystemGuidance: null,
	installedDesignSystem: null,
	sharedStandards: null,
	nodeModules: null,
};
const TASKS: Record<string, (text: string) => string> = {
	'move-to-code.md': (text) => buildInCodebaseTask({ skill: text, pageFile: '/p/i1.html', auditFile: '/d/audit-i1.md', name: 'i1' }, parts),
	'codebase-work.md': (text) => codebaseTask({ unattended: text, task: 'The task.' }, parts),
	'handoff.md': (text) => handoffTask({ skill: text, projectId: 'p', branch: 'feature/p', gate: null }, parts),
	'build-prototype.md': (text) =>
		prototypeBuildTask({ guide: '', skill: text, build: prototypeBuild, sources, accessibility: '', voice: '', request: 'A list' }),
	'address-comments.md': (text) =>
		prototypeAddressTask({
			guide: '',
			addressSkill: text,
			buildSkill: '',
			build: prototypeBuild,
			sources,
			accessibility: '',
			voice: '',
			commentsPath: '/p/comments.md',
			number: 1,
			name: 'v1-i1',
		}),
};

/** Every `file.md` a skill says is in the task, in the same sentence. */
const claimed = (text: string): string[] => [...text.matchAll(/`([\w./-]+\.md)`[^`.\n]{0,40}\bin (?:your|the) task\b/g)].map((m) => m[1] as string);

describe('what a skill says is in its task', () => {
	it('is there', () => {
		const missing = readdirSync(SKILLS)
			.filter((f) => f.endsWith('.md'))
			.flatMap((name) => {
				const files = claimed(skill(name));
				if (files.length === 0) return [];
				const build = TASKS[name];
				if (!build) return [`${name} says ${files.join(', ')} is in its task: add the task it is given in to TASKS`];
				const task = build(skill(name));
				return files.filter((file) => !task.includes(skill(file).split('\n')[0] ?? '')).map((file) => `${name} says ${file} is in its task`);
			});
		expect(missing).toEqual([]);
	});

	it('is found when a skill says it', () => {
		expect(claimed('`codebase-work.md` (in your task too) says how it runs')).toEqual(['codebase-work.md']);
		expect(claimed('read `x.md`, beside this file')).toEqual([]);
		// "It" here is the skill itself, in the next sentence.
		expect(claimed('from Claude Code (`start-prototype.md`), so nobody has to find it. It is also in the task')).toEqual([]);
	});
});
