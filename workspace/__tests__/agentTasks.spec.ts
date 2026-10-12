import { describe, expect, it } from 'vitest';
import { codebaseTask, handoffTask, moveToCodeTask } from '../src/main/services/agentTasks';

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
