import { describe, expect, it } from 'vitest';
import { mergeRepositories, originOf, reachableRepositories, visibleRepositories } from '../src/main/services/repositories';
import { type RouteCall, fakeGitHub } from './fakes/github';

describe('originOf', () => {
	it('reads the origin remote from .git/config, and only origin', () => {
		const config =
			'[core]\n\tbare = false\n[remote "upstream"]\n\turl = git@github.com:up/x.git\n[remote "origin"]\n\turl = git@github.com:me/x.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n';
		expect(originOf('/r', () => config)).toBe('git@github.com:me/x.git');
	});

	it('is null with no origin, or no config to read', () => {
		expect(originOf('/r', () => '[core]\n')).toBeNull();
		expect(
			originOf('/r', () => {
				throw new Error('ENOENT');
			}),
		).toBeNull();
	});
});

describe('mergeRepositories', () => {
	it("keeps GitHub's order, fills in each clone, and adds clones GitHub did not list", () => {
		const r = mergeRepositories(
			['Flock-Safety/flock-coke', 'flock-safety/other'],
			[
				{ root: '/c/flock-coke', repo: 'flock-safety/flock-coke' },
				{ root: '/c/fork', repo: 'me/fork' },
				{ root: '/c/plain', repo: null },
			],
		);
		expect(r).toEqual([
			{ name: 'Flock-Safety/flock-coke', root: '/c/flock-coke' },
			{ name: 'flock-safety/other', root: null },
			{ name: 'me/fork', root: '/c/fork' },
			{ name: 'plain', root: '/c/plain' },
		]);
	});
});

describe('visibleRepositories', () => {
	const page = (n: number, count: number) => Array.from({ length: count }, (_, i) => ({ full_name: `o/r${n}-${i}` }));

	it('reads every page GitHub has, up to the first that is not full, in order', async () => {
		const { github, api } = fakeGitHub({
			'/user/repos*': ({ query }: RouteCall) => {
				const n = Number(query.get('page'));
				return n <= 2 ? page(n, 100) : n === 3 ? page(3, 3) : page(n, 100);
			},
		});
		const names = await visibleRepositories(github);
		expect(names).toHaveLength(203);
		expect(names[0]).toBe('o/r1-0');
		expect(names.at(-1)).toBe('o/r3-2');
		expect(api.mock.calls[0]?.[0]).toContain('affiliation=owner,collaborator,organization_member');
	});

	it('asks for one page alone when it is not full, and for the rest at once when it is', async () => {
		const short = fakeGitHub({ '/user/repos*': page(1, 3) });
		expect(await visibleRepositories(short.github)).toHaveLength(3);
		expect(short.calls).toHaveLength(1);
		let running = 0;
		let most = 0;
		const full = fakeGitHub({
			'/user/repos*': async ({ query }: RouteCall) => {
				running++;
				most = Math.max(most, running);
				await new Promise((r) => setTimeout(r, 5));
				running--;
				return query.get('page') === '1' ? page(1, 100) : page(2, 0);
			},
		});
		await visibleRepositories(full.github);
		// After the first, the other nine were asked together, not one after another.
		expect(full.calls).toHaveLength(10);
		expect(most).toBe(9);
	});
});

describe('reachableRepositories', () => {
	/** A GitHub sign-in that lists `names`, signed in as `login`. */
	const listing = (names: string[], login = 'noah') =>
		fakeGitHub({ '/user': { login }, '/user/repos*': names.map((full_name) => ({ full_name })) }).github;

	it('is every repository the person’s account reaches: their own GitHub sign-in’s, then any the app’s sees that it did not', async () => {
		const app = listing(['flocksafety/flock-designer', 'flocksafety/flock-coke']);
		const person = listing(['flocksafety/flock-coke', 'flocksafety/flock-react-component-lib', 'noah/sandbox']);
		expect(await reachableRepositories(app, person, 'noah')).toEqual({
			names: ['flocksafety/flock-coke', 'flocksafety/flock-react-component-lib', 'noah/sandbox', 'flocksafety/flock-designer'],
			reach: 'account',
		});
	});

	it('names a repository once, whatever its case', async () => {
		expect((await reachableRepositories(listing(['Acme/UI']), listing(['acme/ui']), 'noah')).names).toEqual(['acme/ui']);
	});

	it('takes the command line’s list only when it is signed in as the same person as the app, whatever the case of the name', async () => {
		const someoneElse = listing(['other/private'], 'pat');
		expect(await reachableRepositories(listing(['flocksafety/flock-coke']), someoneElse, 'noah')).toEqual({
			names: ['flocksafety/flock-coke'],
			reach: 'app',
		});
		expect(await reachableRepositories(listing(['a/b']), listing(['c/d'], 'Noah'), 'noah')).toEqual({ names: ['c/d', 'a/b'], reach: 'account' });
	});

	it('is the app’s list alone when the person’s GitHub command line is missing or signed out, or nobody is signed in to the app', async () => {
		const missing = fakeGitHub({
			'*': () => {
				throw new Error('gh: command not found');
			},
		}).github;
		// And says so: the list reaches only what the app's GitHub App is installed on.
		const app = { names: ['flocksafety/flock-coke'], reach: 'app' };
		expect(await reachableRepositories(listing(['flocksafety/flock-coke']), missing, 'noah')).toEqual(app);
		expect(await reachableRepositories(listing(['flocksafety/flock-coke']), null, 'noah')).toEqual(app);
		expect(await reachableRepositories(listing(['flocksafety/flock-coke']), listing(['c/d']), null)).toEqual(app);
	});
});
