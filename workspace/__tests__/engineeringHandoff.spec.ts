import { describe, expect, it } from 'vitest';
import { commandLine } from '../src/core/services/codebase/engineeringHandoff';
import { handoffReady, handoffVerdict } from '../src/shared/handoff';

const commands = [
	{ id: 'preview', label: 'Run', argv: ['npm', 'start'] },
	{ id: 'check-iteration', label: 'Light check', argv: ['npm', 'run', 'check:iteration'] },
	{ id: 'handoff', label: 'Handoff gate', argv: ['npm', 'run', 'handoff', '--', '<prototype-id>'] },
];

describe("a product's commands", () => {
	it('are found by id in its workspace file, for this prototype, or not at all', () => {
		expect(commandLine(commands, 'handoff', 'admin-usage')).toBe('npm run handoff -- admin-usage');
		expect(commandLine(commands, 'check-iteration', 'admin-usage')).toBe('npm run check:iteration');
		expect(commandLine(commands.slice(0, 1), 'handoff', 'admin-usage')).toBeNull();
	});
});

describe('the verdict a handoff commits', () => {
	it('is the first line of HANDOFF.md, alone, however it is dressed', () => {
		expect(handoffVerdict('\n**Ready for engineering**\n\nThe gate passes.\n')).toBe('ready');
		expect(handoffVerdict('`Ready for engineering`')).toBe('ready');
		expect(handoffVerdict('Not ready\n')).toBe('not ready');
	});

	it('is none further down, mid-sentence, or in an empty file', () => {
		expect(handoffVerdict('# Handoff\n\nReady for engineering\n')).toBeNull();
		expect(handoffVerdict('It will be Ready for engineering once the flag exists.')).toBeNull();
		expect(handoffVerdict('')).toBeNull();
	});

	it('is ready only when it says so and nothing was pushed', () => {
		expect(handoffReady({ verdict: 'ready', pushed: false })).toBe(true);
		expect(handoffReady({ verdict: 'ready', pushed: true })).toBe(false);
		expect(handoffReady({ verdict: 'not ready', pushed: false })).toBe(false);
		expect(handoffReady({ verdict: null, pushed: false })).toBe(false);
	});
});
