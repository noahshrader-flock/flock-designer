import { describe, expect, it, vi } from 'vitest';
import { type AddressDeps, addressComment } from '../extension/src/address';
import type { Project } from '../src/shared/contract';
import { ok } from '../src/shared/result';

const review = { projectId: 'demo', name: 'v1', title: 'Demo · Version 1' };
const comment = { thread: 4, id: 40 };
const noah = { name: 'Noah', login: 'noah' };
const version = (name: string) => ({
	name,
	branch: `prototype/demo/${name}`,
	createdAt: `2026-10-0${name.at(-1)}T10:00:00Z`,
	contributors: [noah],
});
const demo = {
	id: 'demo',
	title: 'Demo',
	folder: null,
	records: [],
	work: [version('v1'), version('v3')],
	people: [],
} as unknown as Project;

const world = (
	/** Null when who has commented cannot be read. */
	commenters: string[] | null = ['noah'],
	chooses?: (actions: string[]) => string | undefined,
) => {
	const told: string[] = [];
	const api = {
		handPrototypeAddress: vi.fn(async (_root: string, _projectId: string, _name: string, _comment: unknown, newVersion: boolean) =>
			ok({ editor: true, command: null, target: newVersion ? 'v4' : 'v1', from: newVersion ? 'v1' : null, number: 2 }),
		),
		listProjects: vi.fn(async () => ok([demo])),
		readComments: vi.fn(async () =>
			commenters === null
				? { ok: false, error: 'GitHub could not be reached.' }
				: ok(commenters.map((author, i) => ({ author, resolved: false, thread: 4, id: i + 1 }))),
		),
	};
	const deps: AddressDeps = {
		api: api as unknown as AddressDeps['api'],
		tell: (m) => void told.push(m),
		offer: vi.fn(async (_m: string, actions: string[]) => chooses?.(actions)),
		watch: vi.fn(),
	};
	return { deps, api, told };
};

describe('addressing a comment from a review', () => {
	it('hands the one comment to the agent, watches for its build, and says the person resolves it', async () => {
		const { deps, api, told } = world();
		await addressComment(deps, '/product', review, comment);
		expect(deps.offer).not.toHaveBeenCalled();
		expect(api.handPrototypeAddress).toHaveBeenCalledWith('/product', 'demo', 'v1', comment, false);
		expect(deps.watch).toHaveBeenCalledWith('demo', 'v1', 'Demo · Version 1', null);
		expect(told).toHaveLength(1);
		expect(told[0]).toMatch(/^Comment 2 on Demo · Version 1 is in Claude Code in this window now/);
		expect(told[0]).toMatch(/DSNR saves the page when it is built\. Resolve the comment once you have looked at it\.$/);
	});

	it('asks first when others have commented, and changes it in place when the person says update', async () => {
		const { deps, api } = world(['noah', 'pm', 'pm'], (actions) => actions[0]);
		await addressComment(deps, '/product', review, comment);
		expect(deps.offer).toHaveBeenCalledWith(
			'2 comments from others are on Version 1. Changing it in place can leave their pins on the wrong element.',
			['Update Version 1', 'Start Version 4 from it'],
		);
		expect(api.handPrototypeAddress).toHaveBeenCalledWith('/product', 'demo', 'v1', comment, false);
	});

	it('makes the change in a new version when the person chooses one, watches that one, and says so', async () => {
		const { deps, api, told } = world(['pm'], (actions) => actions[1]);
		await addressComment(deps, '/product', review, comment);
		expect(api.handPrototypeAddress).toHaveBeenCalledWith('/product', 'demo', 'v1', comment, true);
		expect(deps.watch).toHaveBeenCalledWith('demo', 'v4', 'Demo · Version 1', 'v1');
		expect(told[0]).toContain('The change is made in Version 4, a new version from Version 1, which stays as it was.');
	});

	it('asks nothing for the comment being addressed alone, or for resolved ones: they have no other pin to move', async () => {
		const { deps, api } = world(['noah']);
		api.readComments.mockResolvedValue(
			ok([
				{ author: 'pm', resolved: false, ...comment },
				{ author: 'qa', resolved: true, thread: 4, id: 41 },
			]) as never,
		);
		await addressComment(deps, '/product', review, comment);
		expect(deps.offer).not.toHaveBeenCalled();
		expect(api.handPrototypeAddress).toHaveBeenCalledWith('/product', 'demo', 'v1', comment, false);
	});

	it('makes the change in a new version with no question when one was asked for outright', async () => {
		const { deps, api } = world(['pm']);
		await addressComment(deps, '/product', review, comment, true);
		expect(deps.offer).not.toHaveBeenCalled();
		expect(api.readComments).not.toHaveBeenCalled();
		expect(api.handPrototypeAddress).toHaveBeenCalledWith('/product', 'demo', 'v1', comment, true);
	});

	it('hands nothing over when the person chooses neither, and asks the same when who has commented cannot be read', async () => {
		const neither = world(['pm']);
		await addressComment(neither.deps, '/product', review, comment);
		expect(neither.deps.offer).toHaveBeenCalled();
		expect(neither.api.handPrototypeAddress).not.toHaveBeenCalled();
		expect(neither.deps.watch).not.toHaveBeenCalled();
		const unread = world(null, (actions) => actions[0]);
		await addressComment(unread.deps, '/product', review, comment);
		expect(unread.deps.offer).toHaveBeenCalledWith('Who has commented on Version 1 could not be read.', [
			'Update Version 1',
			'Start Version 4 from it',
		]);
	});

	it('fails saying why, watching nothing, when the comment cannot be handed over', async () => {
		const { deps, api } = world();
		api.handPrototypeAddress.mockResolvedValue({ ok: false, error: 'There are no open comments to address.' } as never);
		await expect(addressComment(deps, '/product', review, comment)).rejects.toThrow('There are no open comments to address.');
		expect(deps.watch).not.toHaveBeenCalled();
	});
});
