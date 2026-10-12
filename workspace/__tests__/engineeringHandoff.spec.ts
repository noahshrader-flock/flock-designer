import { describe, expect, it } from 'vitest';
import { codebaseTask, handoffTask } from '../src/main/services/agentTasks';
import { commandLine } from '../src/main/services/engineeringHandoff';
import { lastVerdict } from '../src/shared/handoff';

const commands = [
	{ id: 'preview', label: 'Run', argv: ['npm', 'start'] },
	{ id: 'check-iteration', label: 'Light check', argv: ['npm', 'run', 'check:iteration'] },
	{ id: 'handoff', label: 'Handoff gate', argv: ['npm', 'run', 'handoff', '--', '<project-id>'] },
];

describe("a product's commands", () => {
	it('are found by id in its workspace file, for this project, or not at all', () => {
		expect(commandLine(commands, 'handoff', 'admin-usage')).toBe('npm run handoff -- admin-usage');
		expect(commandLine(commands, 'check-iteration', 'admin-usage')).toBe('npm run check:iteration');
		expect(commandLine(commands.slice(0, 1), 'handoff', 'admin-usage')).toBeNull();
	});
});

describe('the tasks', () => {
	const parts = { lightCheck: 'npm run check:iteration', shared: '', accessibility: '## Accessibility', voice: '' };

	it("carry the shared rules for codebase work before the task, and this product's light check after it", () => {
		const task = codebaseTask({ unattended: '# Codebase work, unattended\n', task: 'Do the thing.' }, parts);
		expect(task.indexOf('# Codebase work, unattended')).toBeLessThan(task.indexOf('Do the thing.'));
		expect(task.indexOf('Do the thing.')).toBeLessThan(task.indexOf('`npm run check:iteration`'));
		expect(codebaseTask({ unattended: null, task: 'x' }, { ...parts, lightCheck: null })).toMatch(/names no light check/);
	});

	it('Handoff: the shared skill, the branch, the gate first and last, the light check, and the verdict line asked for', () => {
		const task = handoffTask(
			{ skill: '# Hand work to engineering\n', projectId: 'admin-usage', branch: 'feature/admin-usage', gate: 'npm run handoff -- admin-usage' },
			parts,
		);
		expect(task).toContain('# Hand work to engineering');
		expect(task).toContain('`feature/admin-usage`');
		expect(task).toMatch(/`npm run handoff -- admin-usage`. Run it first, and last, once HANDOFF.md is committed/);
		expect(task).toContain('`npm run check:iteration`');
		expect(task).toMatch(/`Ready for engineering` or `Not ready`/);
	});
});

describe('the verdict', () => {
	it('is the last verdict line the run said, however it is dressed', () => {
		expect(lastVerdict(['Fixed three findings.', 'Ready for engineering\nThe gate passes.'])).toBe('ready');
		expect(lastVerdict(['**Ready for engineering**'])).toBe('ready');
		expect(lastVerdict(['`Ready for engineering`'])).toBe('ready');
		// An earlier "ready", then the final word: not ready.
		expect(lastVerdict(['Ready for engineering once the gate passes.', 'Not ready', 'The a11y scan fails.'])).toBe('not ready');
	});

	it('is nothing when the run never said one, or said it mid-sentence', () => {
		expect(lastVerdict(['It will be Ready for engineering once the flag exists.'])).toBeNull();
		expect(lastVerdict([])).toBeNull();
	});
});
