import { describe, expect, it, vi } from 'vitest';
import { assignFolder, readProjectArg } from '../extension/src/folders';
import type { Project } from '../src/shared/contract';
import { ok } from '../src/shared/result';

/**
 * Folders in VS Code (ELECTRON_MIGRATION_PLAN 4.5): a project put in a folder, or taken out of one, from its row's
 * right-click menu or its review's, with the same choice New prototype offers: a folder there is, none, or a new one.
 */

const project = (id: string, folder: string | null) => ({ id, title: id, folder, records: ['brief.md'], iterations: [], people: [] }) as Project;

const world = (answers: (string | undefined)[]) => {
	const asked = [...answers];
	const api = {
		listProjects: vi.fn(async () => ok([project('demo', 'Maps'), project('other', 'Admin')])),
		assignFolder: vi.fn(async () => ok(null)),
	};
	const deps = {
		api,
		ask: {
			text: vi.fn(async () => asked.shift()),
			pick: vi.fn(async ({ items }: { items: { label: string; value: unknown }[] }) => {
				const label = asked.shift();
				return label === undefined ? undefined : items.find((i) => i.label === label)?.value;
			}),
		},
		onChanged: vi.fn(),
	};
	return { deps, api };
};

describe('assigning a project’s folder', () => {
	it('offers the folders there are, no folder and a new one, saying which it is in now, and puts it there', async () => {
		const { deps, api } = world(['Admin']);
		await assignFolder(deps as never, 'demo');
		const { items, placeholder } = vi.mocked(deps.ask.pick).mock.calls[0]![0] as never as { items: { label: string }[]; placeholder: string };
		expect(items.map((i) => i.label)).toEqual(['No folder', 'Admin', 'Maps', '$(add) New folder…']);
		expect(placeholder).toBe('demo is in Maps');
		expect(api.assignFolder).toHaveBeenCalledWith('demo', 'Admin');
		expect(deps.onChanged).toHaveBeenCalled();
	});

	it('takes it out of its folder, or into a new one', async () => {
		const out = world(['No folder']);
		await assignFolder(out.deps as never, 'demo');
		expect(out.api.assignFolder).toHaveBeenCalledWith('demo', null);
		const fresh = world(['$(add) New folder…', ' Zones ']);
		await assignFolder(fresh.deps as never, 'demo');
		expect(fresh.api.assignFolder).toHaveBeenCalledWith('demo', 'Zones');
	});

	it('does nothing when dismissed, or when the folder is the one it is in', async () => {
		for (const answers of [[undefined], ['Maps'], ['$(add) New folder…', undefined]]) {
			const { deps, api } = world(answers);
			await assignFolder(deps as never, 'demo');
			expect(api.assignFolder).not.toHaveBeenCalled();
		}
	});

	it('says when the project is not there', async () => {
		await expect(assignFolder(world([]).deps as never, 'gone')).rejects.toThrow('There is no project gone here.');
	});
});

describe('what the command is given', () => {
	it('is a row’s context, from its right-click menu, or nothing', () => {
		expect(readProjectArg({ webviewSection: 'project', projectId: 'demo', preventDefaultContextMenuItems: true })).toBe('demo');
		expect(readProjectArg(undefined)).toBeNull();
		expect(readProjectArg({ projectId: 3 })).toBeNull();
		expect(readProjectArg({ projectId: '../etc' })).toBeNull();
	});
});
