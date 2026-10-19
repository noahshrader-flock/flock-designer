import { describe, expect, it, vi } from 'vitest';
import { type AddressDeps, addressComment } from '../extension/src/address';
import type { Project } from '../src/shared/contract';
import { ok } from '../src/shared/result';

/**
 * Address on a prototype's comment, from its review in VS Code (ELECTRON_MIGRATION_PLAN 4.2): the app's own Address
 * (`runPrototypeAddress`), shown as a build is, with Stop and its log; then the review shows where the change went, and
 * says so, or says the agent changed nothing. Before a version others have commented on is changed, the person chooses.
 */

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
	addressed: { changed: boolean; version: string } = { changed: true, version: 'v1' },
	/** Who has commented on the version: its maker alone, unless said; null when that cannot be read. */
	commenters: string[] | null = ['noah'],
	/** What the person chooses when asked, or undefined for neither. */
	chooses?: (actions: string[]) => string | undefined,
) => {
	const said: string[] = [];
	const told: string[] = [];
	const api = {
		agentReadiness: vi.fn(async () => ok({ state: 'ready' })),
		// The core's Address, run to its end: where the change went.
		addressPrototype: vi.fn(async () => ok({ state: 'done', value: { ...addressed, made: null, comment } })),
		listProjects: vi.fn(async () => ok([demo])),
		readComments: vi.fn(async () =>
			commenters === null
				? { ok: false, error: 'GitHub could not be reached.' }
				: ok(commenters.map((author, i) => ({ author, resolved: false, thread: 4, id: i + 1 }))),
		),
		stopAgent: vi.fn(async () => ok(null)),
		onAgentLog: vi.fn(() => () => undefined),
	};
	const deps: AddressDeps = {
		api: api as unknown as AddressDeps['api'],
		progress: vi.fn(async (title, task) => {
			said.push(title);
			await task((m: string) => void said.push(m));
		}),
		log: { start: vi.fn(), line: vi.fn() },
		tell: (m) => void told.push(m),
		offer: vi.fn(async (_m: string, actions: string[]) => chooses?.(actions)),
		show: vi.fn(async () => undefined),
	};
	return { deps, api, said, told };
};

describe('addressing a comment from a review', () => {
	it('runs the agent on the one comment, said as it goes, shows the changed page, and says which it is', async () => {
		const { deps, api, said, told } = world();
		// It says which version it showed, for whoever asked to go to it (a browser).
		expect(await addressComment(deps, review, comment)).toBe('v1');
		// Only its maker has commented: no question, and the change is made in place.
		expect(deps.offer).not.toHaveBeenCalled();
		expect(api.addressPrototype).toHaveBeenCalledWith('demo', 'v1', comment, false);
		expect(said).toEqual(['Addressing a comment on Demo · Version 1', 'The agent is working on the comment. This takes a few minutes.']);
		expect(deps.log.start).toHaveBeenCalledWith('Demo · Version 1: addressing a comment');
		expect(told).toEqual(['The agent has finished. Look at the page, then resolve what is done.']);
		expect(deps.show).toHaveBeenCalledWith(review);
	});

	it('asks first when others have commented, and changes it in place when the person says update', async () => {
		const { deps, api } = world(undefined, ['noah', 'pm', 'pm'], (actions) => actions[0]);
		expect(await addressComment(deps, review, comment)).toBe('v1');
		expect(deps.offer).toHaveBeenCalledWith(
			'2 comments from others are on Version 1. Changing it in place can leave their pins on the wrong element.',
			['Update Version 1', 'Start Version 4 from it'],
		);
		expect(api.addressPrototype).toHaveBeenCalledWith('demo', 'v1', comment, false);
	});

	it('makes the change in a new version when the person chooses one, shows it, and says so', async () => {
		const { deps, api, told } = world({ changed: true, version: 'v4' }, ['pm'], (actions) => actions[1]);
		expect(await addressComment(deps, review, comment)).toBe('v4');
		expect(api.addressPrototype).toHaveBeenCalledWith('demo', 'v1', comment, true);
		expect(told).toEqual(['The change is in Version 4, a new version from Version 1, which stays as it was.']);
	});

	it('asks nothing for the comment being addressed alone, or for resolved ones: they have no other pin to move', async () => {
		const { deps, api } = world(undefined, ['noah']);
		api.readComments.mockResolvedValue(
			ok([
				{ author: 'pm', resolved: false, ...comment },
				{ author: 'qa', resolved: true, thread: 4, id: 41 },
			]) as never,
		);
		expect(await addressComment(deps, review, comment)).toBe('v1');
		expect(deps.offer).not.toHaveBeenCalled();
		expect(api.addressPrototype).toHaveBeenCalledWith('demo', 'v1', comment, false);
	});

	it('makes the change in a new version with no question when one was asked for outright', async () => {
		const { deps, api } = world({ changed: true, version: 'v4' }, ['pm']);
		expect(await addressComment(deps, review, comment, true)).toBe('v4');
		expect(deps.offer).not.toHaveBeenCalled();
		expect(api.readComments).not.toHaveBeenCalled();
		expect(api.addressPrototype).toHaveBeenCalledWith('demo', 'v1', comment, true);
	});

	it('does nothing when the person chooses neither, and asks the same when who has commented cannot be read', async () => {
		const neither = world(undefined, ['pm']);
		expect(await addressComment(neither.deps, review, comment)).toBeNull();
		expect(neither.deps.offer).toHaveBeenCalled();
		expect(neither.api.addressPrototype).not.toHaveBeenCalled();
		const unread = world(undefined, null, (actions) => actions[0]);
		expect(await addressComment(unread.deps, review, comment)).toBe('v1');
		expect(unread.deps.offer).toHaveBeenCalledWith('Who has commented on Version 1 could not be read.', [
			'Update Version 1',
			'Start Version 4 from it',
		]);
	});

	it('says when the agent changed nothing, and leaves the review as it is', async () => {
		const { deps, told } = world({ changed: false, version: 'v1' });
		expect(await addressComment(deps, review, comment)).toBeNull();
		expect(told[0]).toMatch(/^The agent finished without changing anything\. Its log says why/);
		expect(deps.show).not.toHaveBeenCalled();
	});

	it('stops when Stop is pressed, and finishes nothing', async () => {
		const { deps, api, told } = world();
		// Stopped, the core's Address ends as stopped: the change is finished the next time the prototype is opened.
		api.addressPrototype.mockResolvedValue(ok({ state: 'stopped' }) as never);
		deps.progress = vi.fn(async (_title, task, onStop) => {
			onStop();
			await task(() => undefined);
		});
		expect(await addressComment(deps, review, comment)).toBeNull();
		expect(api.stopAgent).toHaveBeenCalled();
		expect(deps.show).not.toHaveBeenCalled();
		expect(told).toEqual([]);
	});

	it('fails saying why, and before anything when Claude Code is not here', async () => {
		const failing = world();
		failing.api.addressPrototype.mockResolvedValue({ ok: false, error: 'The comment is resolved.' } as never);
		await expect(addressComment(failing.deps, review, comment)).rejects.toThrow('The comment was not addressed: The comment is resolved.');
		const missing = world();
		missing.api.agentReadiness.mockResolvedValue(ok({ state: 'missing' }) as never);
		await expect(addressComment(missing.deps, review, comment)).rejects.toThrow(/Claude Code is not installed/);
		expect(missing.api.addressPrototype).not.toHaveBeenCalled();
	});
});
