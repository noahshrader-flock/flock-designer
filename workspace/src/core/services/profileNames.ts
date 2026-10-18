import { isBot, mergePeople } from '../../shared/people';
import type { Person, Project } from '../../shared/contract';

/**
 * One name for a person, everywhere: their GitHub profile name.
 *
 * Names reach the app from git commits, and a git name is whatever that tool was set to (`Noah Shrader` from one,
 * `noahshrader-flock` from another), so the same person looked like two. A person whose GitHub login is known is
 * shown by their profile name instead; a profile with no name is shown by its login; a person known only by a git name
 * keeps it. Looked up once per login for as long as the app runs, and a lookup that fails changes nothing.
 */
export class ProfileNames {
	private readonly names = new Map<string, Promise<string>>();

	constructor(private readonly api: (path: string) => Promise<unknown>) {}

	/** The profile name of `login`, else the login itself. A failed lookup is not remembered, so the next list tries again. */
	private nameOf(login: string): Promise<string> {
		const known = this.names.get(login.toLowerCase());
		if (known) return known;
		const looking = this.api(`/users/${encodeURIComponent(login)}`).then((profile) => {
			const name = (profile as { name?: unknown } | null)?.name;
			return typeof name === 'string' && name.trim() ? name.trim() : login;
		});
		this.names.set(login.toLowerCase(), looking);
		// Dropped again if it failed, so a moment without a network does not decide it for good.
		looking.catch(() => this.names.delete(login.toLowerCase()));
		return looking;
	}

	/** The people with their profile names, and anyone who is now the same person joined. */
	private async named(people: Person[]): Promise<Person[]> {
		const resolved = await Promise.all(
			people.map(async (p): Promise<Person> => {
				if (p.login === null || isBot(p.login)) return p;
				return { ...p, name: await this.nameOf(p.login).catch(() => p.name) };
			}),
		);
		return mergePeople(resolved);
	}

	/** Every project's people, and each piece of work's contributors, named the same way. */
	async nameEveryone(projects: Project[]): Promise<Project[]> {
		// All at once, so a person who is in several places is looked up once for the list, not once each.
		return Promise.all(
			projects.map(async (project) => {
				const [people, work] = await Promise.all([
					this.named(project.people),
					Promise.all(project.work.map(async (it) => ({ ...it, contributors: await this.named(it.contributors) }))),
				]);
				return { ...project, people, work };
			}),
		);
	}
}
