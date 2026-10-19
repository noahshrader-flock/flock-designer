import { describe, expect, it, vi } from 'vitest';
import { ProfileNames } from '../src/core/services/publishing/profileNames';
import type { Person, Project, ProjectWork } from '../src/shared/contract';
import { aProject, projectWork } from './fixtures';

const PROFILES: Record<string, unknown> = {
	noahshrader: { login: 'noahshrader', name: 'Noah Shrader' },
	'noahshrader-flock': { login: 'noahshrader-flock', name: 'Noah Shrader' },
	sam: { login: 'sam', name: '  ' },
	ava: { login: 'ava', name: null },
};
const fakeProfiles = () =>
	vi.fn(async (path: string) => {
		const login = decodeURIComponent(path.replace('/users/', ''));
		if (!(login in PROFILES)) throw new Error(`HTTP 404 ${path}`);
		return PROFILES[login];
	});

const version = (contributors: Person[]): ProjectWork => projectWork({ name: 'v1', branch: 'prototype/a/v1', contributors });
const project = (people: Person[], contributors: Person[] = people): Project =>
	aProject({ id: 'a', title: 'A', work: [version(contributors)], people });

describe('naming people by their GitHub profile', () => {
	it('shows a person by their profile name, whatever git called them', async () => {
		const [p] = await new ProfileNames(fakeProfiles()).nameEveryone([project([{ name: 'noahshrader-flock', login: 'noahshrader-flock' }])]);
		expect(p!.people).toEqual([{ name: 'Noah Shrader', login: 'noahshrader-flock' }]);
	});

	it('names a version’s contributors the same way', async () => {
		const [p] = await new ProfileNames(fakeProfiles()).nameEveryone([project([], [{ name: 'noahshrader', login: 'noahshrader' }])]);
		expect(p!.work[0]!.contributors).toEqual([{ name: 'Noah Shrader', login: 'noahshrader' }]);
	});

	it('is one person when git called them two things and they are one account', async () => {
		const [p] = await new ProfileNames(fakeProfiles()).nameEveryone([
			project([
				{ name: 'Noah Shrader', login: 'noahshrader' },
				{ name: 'noahshrader', login: 'noahshrader' },
			]),
		]);
		expect(p!.people).toHaveLength(1);
		expect(p!.people[0]).toEqual({ name: 'Noah Shrader', login: 'noahshrader' });
	});

	it('shows the login when the profile has no name (or only spaces), and keeps a git name with no login', async () => {
		const [p] = await new ProfileNames(fakeProfiles()).nameEveryone([
			project([
				{ name: 'S. Lee', login: 'sam' },
				{ name: 'Ava C.', login: 'ava' },
				{ name: 'Someone Git', login: null },
			]),
		]);
		expect(p!.people.map((x) => x.name).sort()).toEqual(['Someone Git', 'ava', 'sam']);
	});

	it('leaves a bot alone, and does not look it up', async () => {
		const api = fakeProfiles();
		const [p] = await new ProfileNames(api).nameEveryone([project([{ name: 'github-actions[bot]', login: 'github-actions[bot]' }])]);
		expect(p!.people).toEqual([{ name: 'github-actions[bot]', login: 'github-actions[bot]' }]);
		expect(api).not.toHaveBeenCalled();
	});

	it('looks each person up once, across projects and lists', async () => {
		const api = fakeProfiles();
		const names = new ProfileNames(api);
		const who: Person = { name: 'x', login: 'noahshrader' };
		await names.nameEveryone([project([who]), project([who]), project([], [who])]);
		await names.nameEveryone([project([who])]);
		expect(api).toHaveBeenCalledTimes(1);
		expect(api).toHaveBeenCalledWith('/users/noahshrader');
	});

	it('changes nothing for a person whose lookup fails, and tries again next time', async () => {
		const api = fakeProfiles();
		const names = new ProfileNames(api);
		const gone: Person = { name: 'Git Name', login: 'nobody-here' };
		const [first] = await names.nameEveryone([project([gone])]);
		expect(first!.people).toEqual([gone]);
		// Once for the list, however many places the person is in; and again for the next list.
		expect(api).toHaveBeenCalledTimes(1);
		await names.nameEveryone([project([gone])]);
		expect(api).toHaveBeenCalledTimes(2);
	});

	it('keeps everything else about a project as it was', async () => {
		const original = { ...project([{ name: 'a', login: 'noahshrader' }]), records: ['brief.md'], localOnly: true };
		const [p] = await new ProfileNames(fakeProfiles()).nameEveryone([original]);
		expect(p).toMatchObject({ id: 'a', title: 'A', records: ['brief.md'], localOnly: true });
		expect(p!.work).toHaveLength(1);
	});
});
