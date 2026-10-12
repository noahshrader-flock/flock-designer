import { describe, expect, it } from 'vitest';
import { addressTask, codebaseTask, handoffTask, moveToCodeTask } from '../src/main/services/agentTasks';

const parts = {
	lightCheck: 'npm run check:iteration',
	shared: '## Also yours to read (never change)\n\n- Shared standards: `/d/standards`',
	accessibility: '## Accessibility\n\nThe rules.',
	voice: '## Voice and tone\n\nCalm.',
};

/** Where each part is in a task, in the order every run in a checkout is meant to have them. */
const order = (task: string) =>
	["This product's light check", '## Also yours to read', '## Accessibility', '## Voice and tone'].map((part) => task.indexOf(part));

describe('every run in a product checkout', () => {
	const tasks = {
		'codebase work': codebaseTask({ unattended: '# Codebase work, unattended', task: 'Build it.' }, parts),
		'an Address on a branch': codebaseTask({ unattended: null, task: 'Address comment 1.' }, parts),
		Handoff: handoffTask({ skill: '# Hand off', projectId: 'p', branch: 'feature/p', gate: null }, parts),
		'moving a prototype into the code': moveToCodeTask({ skill: '# Move', pageFile: '/p.html', auditFile: '/a.md', name: 'v1-i1' }, parts),
	};

	it.each(Object.entries(tasks))('ends with the same parts, in the same order: %s', (_kind, task) => {
		const at = order(task);
		expect(at.every((i) => i > 0)).toBe(true);
		expect([...at].sort((a, b) => a - b)).toEqual(at);
	});

	it('leaves out the voice when the design system has none written, and the folders when there are none', () => {
		const task = codebaseTask({ unattended: null, task: 'x' }, { ...parts, shared: '', voice: '' });
		expect(task).not.toContain('## Voice and tone');
		expect(task).not.toContain('## Also yours to read');
		expect(task).toContain('## Accessibility');
	});
});

describe('codebase work and Handoff', () => {
	const bare = { ...parts, shared: '', voice: '' };

	it("carry the shared rules for codebase work before the task, and this product's light check after it", () => {
		const task = codebaseTask({ unattended: '# Codebase work, unattended\n', task: 'Do the thing.' }, bare);
		expect(task.indexOf('# Codebase work, unattended')).toBeLessThan(task.indexOf('Do the thing.'));
		expect(task.indexOf('Do the thing.')).toBeLessThan(task.indexOf('`npm run check:iteration`'));
		expect(codebaseTask({ unattended: null, task: 'x' }, { ...bare, lightCheck: null })).toMatch(/names no light check/);
	});

	it('Handoff: the shared skill, the branch, the gate first and last, the light check, and the verdict line asked for', () => {
		const task = handoffTask(
			{ skill: '# Hand work to engineering\n', projectId: 'admin-usage', branch: 'feature/admin-usage', gate: 'npm run handoff -- admin-usage' },
			bare,
		);
		expect(task).toContain('# Hand work to engineering');
		expect(task).toContain('`feature/admin-usage`');
		expect(task).toMatch(/`npm run handoff -- admin-usage`. Run it first, and last, once HANDOFF.md is committed/);
		expect(task).toContain('`npm run check:iteration`');
		expect(task).toMatch(/`Ready for engineering` or `Not ready`/);
	});
});

describe('addressTask', () => {
	it('asks for the one comment it was given, by the number on its pin', () => {
		const one = addressTask('/r/comments.md', 'fd/demo/i1', 'SKILL', 3);
		expect(one).toContain('Address comment 3 on this project, and only that one.');
		expect(one).toContain('leave them');
		expect(one.endsWith('SKILL')).toBe(true);
	});

	it('is short and names what the app produced', () => {
		const task = addressTask('/r/projects/demo/comments.md', 'fd/demo/i1', 'SKILL TEXT', 1);
		expect(task.split('\n').slice(0, 2)).toEqual([
			'Address comment 1 on this project, and only that one.',
			'The comments are in /r/projects/demo/comments.md, written from GitHub a moment ago. Read it first.',
		]);
		expect(task).toContain("This iteration's branch is fd/demo/i1.");
		expect(task.endsWith('SKILL TEXT')).toBe(true);
	});
});

describe('moving a prototype into the code', () => {
	it('asks for the audit before any code changes', () => {
		const task = moveToCodeTask(
			{ skill: 's', pageFile: '/q/i1.html', auditFile: '/d/projects/users/audit-i1.md', name: 'i1' },
			{ lightCheck: null, shared: '', accessibility: '', voice: '' },
		);
		expect(task).toContain('Write the audit to `/d/projects/users/audit-i1.md` before you change any code.');
	});
});
