import { describe, expect, it } from 'vitest';
import { gateCommand, handoffTask } from '../src/main/services/engineeringHandoff';

describe('the product\'s handoff gate', () => {
	it('is the command the workspace file names, for this project', () => {
		const commands = [
			{ id: 'preview', label: 'Run', argv: ['npm', 'start'] },
			{ id: 'handoff', label: 'Handoff gate', argv: ['npm', 'run', 'handoff', '--', '<project-id>'] },
		];
		expect(gateCommand(commands, 'admin-usage')).toBe('npm run handoff -- admin-usage');
		expect(gateCommand(commands.slice(0, 1), 'admin-usage')).toBeNull();
	});
});

describe('the Handoff task', () => {
	it('carries the shared skill, the branch, the gate and the verdict line asked for', () => {
		const task = handoffTask({ skill: '# Hand work to engineering\n', projectId: 'admin-usage', branch: 'feature/admin-usage', gate: 'npm run handoff -- admin-usage' });
		expect(task).toContain('# Hand work to engineering');
		expect(task).toContain('`feature/admin-usage`');
		expect(task).toContain('`npm run handoff -- admin-usage`');
		expect(task).toMatch(/`Ready for engineering` or `Not ready`/);
	});
});
