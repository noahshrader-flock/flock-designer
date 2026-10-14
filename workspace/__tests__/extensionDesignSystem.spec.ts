import { describe, expect, it, vi } from 'vitest';
import { showFound } from '../extension/src/designSystem';
import type { ConnectedDesignSystem } from '../src/shared/contract';

/**
 * The design system VS Code found is the one the core shows (ELECTRON_MIGRATION_PLAN 6.1): the core reads, previews,
 * pictures and changes the design system it is told is shown, as the app's connected one, so the folder found is told to it
 * as that, and only when it is a different one. When it cannot be read, why is said instead.
 */

const fui: ConnectedDesignSystem = {
	id: 'flocksafety/flock-react-component-lib',
	name: 'FUI',
	repository: 'flocksafety/flock-react-component-lib',
	root: '/w/flock-react-component-lib',
	folder: '',
	branch: 'develop',
};
const memory = (current: ConnectedDesignSystem | null = null) => ({ current: vi.fn(() => current), add: vi.fn() });

describe('the design system found, shown', () => {
	it('is told to the core as the one shown, read from the folder found', async () => {
		const m = memory();
		const read = vi.fn(async () => fui);
		expect(await showFound(m, { root: fui.root, how: 'open' }, read)).toBeNull();
		expect(read).toHaveBeenCalledWith(fui.root);
		expect(m.add).toHaveBeenCalledWith(fui);
	});

	it('is not told again when it is the one shown already, so nothing is written for nothing', async () => {
		const m = memory(fui);
		expect(await showFound(m, { root: fui.root, how: 'named' }, async () => ({ ...fui }))).toBeNull();
		expect(m.add).not.toHaveBeenCalled();
		// Its default branch changed: told again.
		await showFound(m, { root: fui.root, how: 'named' }, async () => ({ ...fui, branch: 'main' }));
		expect(m.add).toHaveBeenCalledWith({ ...fui, branch: 'main' });
	});

	it('says why, and tells the core nothing, when the folder cannot be read', async () => {
		const m = memory();
		const why = await showFound(m, { root: '/w/plain', how: 'located' }, async () => {
			throw new Error('/w/plain is not a git repository.');
		});
		expect(why).toBe('/w/plain is not a git repository.');
		expect(m.add).not.toHaveBeenCalled();
	});

	it('with none found, tells the core nothing and has nothing to say', async () => {
		const m = memory(fui);
		const read = vi.fn();
		expect(await showFound(m, null, read)).toBeNull();
		expect(read).not.toHaveBeenCalled();
		expect(m.add).not.toHaveBeenCalled();
	});
});
