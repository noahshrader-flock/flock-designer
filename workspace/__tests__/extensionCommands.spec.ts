import { describe, expect, it, vi } from 'vitest';
import { type CommandDeps, commands } from '../extension/src/commands';
import type { Review } from '../extension/src/messages';

const review: Review = { prototypeId: 'demo', name: 'v1', title: 'Demo · Version 1' };

const given = (more: Partial<CommandDeps> = {}) => {
	const d = {
		run: vi.fn(async () => undefined),
		tell: vi.fn(),
		inPanel: vi.fn(async () => undefined),
		openReview: vi.fn(async () => undefined),
		pickReview: vi.fn(async () => review),
		activeReview: () => undefined,
		openPublishedPage: vi.fn(async () => undefined),
		copyPublishedLink: vi.fn(async () => undefined),
		signIn: vi.fn(async () => undefined),
		signedIn: () => true,
		chooseAgent: vi.fn(async () => undefined),
		locateDesignRepository: vi.fn(async () => undefined),
		chooseDesignSystem: vi.fn(async () => undefined),
		failed: vi.fn(),
		failedFor: (fromCode: boolean) => (err: unknown) => {
			if (fromCode) throw err;
		},
		...more,
	} satisfies CommandDeps;
	return { d, run: (id: string, raw?: unknown) => commands(d)[id]?.(raw) };
};

describe('DSNR’s commands', () => {
	it('open the review they are given, or the one picked, and nothing when the pick is cancelled', async () => {
		const asked = given();
		await asked.run('dsnr.openReview', review);
		expect(asked.d.openReview).toHaveBeenCalledWith(review);
		await expect(asked.run('dsnr.openReview', { prototypeId: 'demo' })).rejects.toThrow(/not a review/);
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
		expect(front.d.inPanel).toHaveBeenCalledWith({ type: 'open-dialog', dialog: { kind: 'build', prototypeId: 'demo' } });
	});

	it('assign the folder of the prototype right-clicked, else of the review in front, else say how', async () => {
		const clicked = given({ activeReview: () => review });
		await clicked.run('dsnr.assignFolder', { webviewSection: 'prototype', prototypeId: 'other' });
		expect(clicked.d.inPanel).toHaveBeenCalledWith({ type: 'open-dialog', dialog: { kind: 'assign', prototypeId: 'other' } });
		const front = given({ activeReview: () => review });
		await front.run('dsnr.assignFolder');
		expect(front.d.inPanel).toHaveBeenCalledWith({ type: 'open-dialog', dialog: { kind: 'assign', prototypeId: 'demo' } });
		const none = given();
		await none.run('dsnr.assignFolder');
		expect(none.d.tell).toHaveBeenCalledWith(expect.stringMatching(/to assign its folder/));
	});

	it('ask which agent work goes to, from the command palette too', async () => {
		const g = given();
		await g.run('dsnr.chooseAgent');
		expect(g.d.chooseAgent).toHaveBeenCalled();
		await g.run('dsnr.locateDesignRepository');
		expect(g.d.locateDesignRepository).toHaveBeenCalled();
		await g.run('dsnr.chooseDesignSystem');
		expect(g.d.chooseDesignSystem).toHaveBeenCalled();
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
