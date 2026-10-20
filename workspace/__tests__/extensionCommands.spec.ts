import { describe, expect, it, vi } from 'vitest';
import { type CommandDeps, commands } from '../extension/src/commands';
import type { Review } from '../extension/src/messages';

const review: Review = { projectId: 'demo', name: 'v1', title: 'Demo · Version 1' };

const given = (more: Partial<CommandDeps> = {}) => {
	const d = {
		run: vi.fn(async () => undefined),
		tell: vi.fn(),
		inPanel: vi.fn(async () => undefined),
		product: () => ({ root: '/product', why: '' }),
		api: { agentReady: vi.fn(async () => ({ ok: true as const, value: null })) },
		startPrototype: vi.fn(async () => undefined),
		openReview: vi.fn(async () => undefined),
		pickReview: vi.fn(async () => review),
		activeReview: () => undefined,
		openPublishedPage: vi.fn(async () => undefined),
		copyPublishedLink: vi.fn(async () => undefined),
		signIn: vi.fn(async () => undefined),
		signedIn: () => true,
		chooseAgent: vi.fn(async () => undefined),
		failed: vi.fn(),
		failedFor: (fromCode: boolean) => (err: unknown) => {
			if (fromCode) throw err;
		},
		...more,
	} satisfies CommandDeps;
	return { d, run: (id: string, raw?: unknown) => commands(d)[id]?.(raw) };
};

describe('DSNR’s commands', () => {
	it('ask for a new prototype in the panel when run from a menu, and say why not when no product is open', async () => {
		const open = given();
		await open.run('dsnr.newPrototype');
		expect(open.d.inPanel).toHaveBeenCalledWith({ type: 'open-dialog', dialog: { kind: 'new' } });
		const none = given({ product: () => ({ root: null, why: 'Open a product first.' }) });
		await none.run('dsnr.newPrototype');
		expect(none.d.inPanel).not.toHaveBeenCalled();
		expect(none.d.failed).toHaveBeenCalledWith(new Error('Open a product first.'));
		// Before the dialog, so nobody fills it in for an agent that cannot take it.
		const out = given({ api: { agentReady: vi.fn(async () => ({ ok: false as const, error: 'Claude Code is not signed in.' })) } });
		await out.run('dsnr.newPrototype');
		expect(out.d.inPanel).not.toHaveBeenCalled();
		expect(out.d.failed).toHaveBeenCalledWith(new Error('Claude Code is not signed in.'));
	});

	it('start a prototype they are given, and refuse one that is not a name and a task', async () => {
		const { d, run } = given();
		await run('dsnr.newPrototype', { title: 'Made here', task: 'Show a heading.', folder: null });
		expect(d.startPrototype).toHaveBeenCalledWith({ title: 'Made here', task: 'Show a heading.', folder: null });
		expect(() => run('dsnr.newPrototype', { title: 42, task: 'x' })).toThrow(/not a name and what it should explore/);
	});

	it('open the review they are given, or the one picked, and nothing when the pick is cancelled', async () => {
		const asked = given();
		await asked.run('dsnr.openReview', review);
		expect(asked.d.openReview).toHaveBeenCalledWith(review);
		await expect(asked.run('dsnr.openReview', { projectId: 'demo' })).rejects.toThrow(/not a review/);
		const picked = given();
		await picked.run('dsnr.openReview');
		expect(picked.d.openReview).toHaveBeenCalledWith(review);
		const cancelled = given({ pickReview: async () => undefined });
		await cancelled.run('dsnr.openReview');
		expect(cancelled.d.openReview).not.toHaveBeenCalled();
	});

	it('act on the review in front, or say to open one', async () => {
		const none = given();
		for (const id of ['dsnr.openPublishedPage', 'dsnr.copyPublishedLink', 'dsnr.buildInCodebase']) await none.run(id);
		expect(none.d.tell).toHaveBeenCalledTimes(3);
		expect(none.d.tell).toHaveBeenCalledWith('Open a prototype for review first.');
		const front = given({ activeReview: () => review });
		await front.run('dsnr.copyPublishedLink');
		await front.run('dsnr.buildInCodebase');
		expect(front.d.copyPublishedLink).toHaveBeenCalledWith(review);
		expect(front.d.inPanel).toHaveBeenCalledWith({ type: 'open-dialog', dialog: { kind: 'build', projectId: 'demo' } });
	});

	it('assign the folder of the project right-clicked, else of the review in front, else say how', async () => {
		const clicked = given({ activeReview: () => review });
		await clicked.run('dsnr.assignFolder', { webviewSection: 'project', projectId: 'other' });
		expect(clicked.d.inPanel).toHaveBeenCalledWith({ type: 'open-dialog', dialog: { kind: 'assign', projectId: 'other' } });
		const front = given({ activeReview: () => review });
		await front.run('dsnr.assignFolder');
		expect(front.d.inPanel).toHaveBeenCalledWith({ type: 'open-dialog', dialog: { kind: 'assign', projectId: 'demo' } });
		const none = given();
		await none.run('dsnr.assignFolder');
		expect(none.d.tell).toHaveBeenCalledWith(expect.stringMatching(/to assign its folder/));
	});

	it('ask which agent work goes to, from the command palette too', async () => {
		const g = given();
		await g.run('dsnr.chooseAgent');
		expect(g.d.chooseAgent).toHaveBeenCalled();
	});

	it('show the account only to someone signed in', async () => {
		const out = given({ signedIn: () => false });
		await out.run('dsnr.account');
		expect(out.d.inPanel).not.toHaveBeenCalled();
		const signed = given();
		await signed.run('dsnr.account');
		expect(signed.d.inPanel).toHaveBeenCalledWith({ type: 'open-dialog', dialog: { kind: 'account' } });
	});
});
