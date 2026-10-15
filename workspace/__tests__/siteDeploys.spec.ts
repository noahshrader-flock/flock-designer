import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubAccount } from '../src/host/github';

const pages = vi.hoisted(() => ({
	siteBehind: vi.fn(),
	publish: vi.fn(),
	pageStatus: vi.fn(),
	recordsFrom: vi.fn(async () => ({})),
	redeploySite: vi.fn(),
}));
vi.mock('../src/main/services/pages', () => pages);
const { siteDeploys } = await import('../src/main/services/siteDeploys');

let signedIn = true;
const github = {
	state: () => (signedIn ? { state: 'signedIn', user: { login: 'noah', name: 'Noah' } } : { state: 'signedOut' }),
	api: vi.fn(),
} as unknown as Pick<GitHubAccount, 'state' | 'api'>;
const deploys = () => siteDeploys({ github, designClone: () => null });
/** Lets a deploy started in the background settle. */
const settle = () => new Promise((r) => setImmediate(r));
const MINUTE = 60_000;
/** A moment long after the app opened, as any real one is. */
const T = 1_000 * MINUTE;

beforeEach(() => {
	signedIn = true;
	vi.clearAllMocks();
	vi.useFakeTimers({ toFake: ['Date'], now: T });
	pages.siteBehind.mockResolvedValue({ kind: 'page', projectId: 'demo', name: 'v1-i1' });
	pages.publish.mockResolvedValue({});
	pages.pageStatus.mockResolvedValue({ state: 'unpublished' });
});
afterEach(() => vi.useRealTimers());

describe("the site's deploys", () => {
	it('do nothing for someone signed out', async () => {
		signedIn = false;
		const d = deploys();
		d.page('demo', 'v1-i1');
		await d.catchUp();
		expect(pages.publish).not.toHaveBeenCalled();
		expect(pages.siteBehind).not.toHaveBeenCalled();
		expect(await d.status('demo', 'v1-i1')).toEqual({ state: 'none' });
	});

	it('catch up at most once a minute, and once every ten after a deploy failed', async () => {
		const d = deploys();
		await d.catchUp();
		await settle();
		expect(pages.publish).toHaveBeenCalledTimes(1);
		vi.setSystemTime(T + MINUTE / 2);
		await d.catchUp();
		expect(pages.siteBehind).toHaveBeenCalledTimes(1);
		pages.publish.mockRejectedValue(new Error('The app has no Pages permission.'));
		vi.setSystemTime(T + MINUTE + 1);
		await d.catchUp();
		await settle();
		expect(pages.siteBehind).toHaveBeenCalledTimes(2);
		vi.setSystemTime(T + 3 * MINUTE);
		await d.catchUp();
		expect(pages.siteBehind).toHaveBeenCalledTimes(2);
		vi.setSystemTime(T + 12 * MINUTE);
		await d.catchUp();
		expect(pages.siteBehind).toHaveBeenCalledTimes(3);
	});

	it('wait while a deploy is running, and say it is publishing', async () => {
		pages.publish.mockReturnValue(new Promise(() => undefined));
		const d = deploys();
		d.page('demo', 'v1-i1');
		await d.catchUp();
		expect(pages.siteBehind).not.toHaveBeenCalled();
		expect(await d.status('demo', 'v1-i1')).toEqual({ state: 'publishing' });
	});

	it('say why a page is not published when its deploy stopped, and when GitHub would not say', async () => {
		pages.publish.mockRejectedValue(new Error('The app has no Pages permission.'));
		const d = deploys();
		d.page('demo', 'v1-i1');
		await settle();
		expect(await d.status('demo', 'v1-i1')).toEqual({ state: 'unpublished', why: 'The app has no Pages permission.' });
		pages.pageStatus.mockRejectedValue(new Error('HTTP 403'));
		expect(await d.status('demo', 'v1-i1')).toEqual({ state: 'unavailable', why: 'GitHub would not say whether this is published: HTTP 403' });
	});
});
