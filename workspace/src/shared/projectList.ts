import type { MadeCover, Project, ProjectIteration } from './contract';
import { mergePeople } from './people';
import { matchesWords } from './search';
import { asCover, asDate } from './validate';
import { projectCodeLink, workKind, workOf } from './work';
import { byNewest } from './sort';

/** The list of projects as screens show it: dated, ordered, searched, merged from GitHub and this machine, with covers. */

/** When a project was started: its earliest iteration's date, or null if none has one. */
export const startedAt = (p: Pick<Project, 'iterations'>): string | null =>
	p.iterations
		.map((i) => i.createdAt)
		.filter((d): d is string => d !== null)
		.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;

/** The latest of some dates, ignoring anything that is not one; null when none is. */
export const latestDate = (dates: unknown[]): string | null =>
	dates
		.map(asDate)
		.filter((d): d is string => d !== null)
		.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

/**
 * When anything last happened in a project: the latest of the activity GitHub reported (`updatedAt`) and when each of
 * its iterations was made. Null when nothing is dated.
 */
export const lastUpdated = (p: Pick<Project, 'iterations'> & { updatedAt?: string | null }): string | null =>
	latestDate([p.updatedAt, ...p.iterations.map((i) => i.createdAt)]);

/** Alphabetical by name without regard to case, and by id when two share a name, so an order never shuffles. */
const byName = (a: Project, b: Project): number => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);

/** How the Projects screen orders its cards: the most recent activity first, or by name. */
export type ProjectOrder = 'updated' | 'alphabetical';

/** The projects in an order, as a new list. Those with nothing dated come last when ordered by activity. */
export const sortProjects = (projects: Project[], order: ProjectOrder): Project[] =>
	[...projects].sort(order === 'alphabetical' ? byName : byNewest(lastUpdated, byName));

/**
 * Whether a project is what a search is for: every word typed is somewhere in its name, its id, its folder, or the name or
 * GitHub login of someone who worked on it, without regard to case. Plain text, never a pattern; an empty search is
 * every project.
 */
export const matchesProject = (project: Project, search: string): boolean =>
	matchesWords([project.title, project.id, project.folder ?? '', ...project.people.flatMap((p) => [p.name, p.login ?? ''])].join('\n'), search);

/** Newest project first. A project with no known date goes last, and ties fall back to the title so the order never shuffles. */
export const newestProjectFirst = byNewest(startedAt, byName);

/**
 * One list from two sources: what is in the design repository on GitHub, and
 * what is on this machine.
 *
 * Work built here has to show up here, whether it was made from the app or by
 * an agent in a terminal, and whether or not it has been shared yet. So the
 * local records are read directly and merged in, and anything that exists only
 * on this machine is marked as such rather than hidden.
 *
 * Where both sides know a project, GitHub's copy leads (it is what everyone
 * else sees) and local facts only fill gaps: an iteration GitHub has not heard
 * of, a title it does not have yet, a name it does not list.
 */
export const mergeProjects = (remote: Project[], local: Project[]): Project[] => {
	const byId = new Map<string, Project>();
	for (const p of remote) byId.set(p.id, { ...p, localOnly: false });

	for (const l of local) {
		const r = byId.get(l.id);
		if (!r) {
			byId.set(l.id, { ...l, localOnly: true, iterations: l.iterations.map((i) => ({ ...i, localOnly: true })) });
			continue;
		}
		const have = new Map<string, ProjectIteration>(r.iterations.map((i) => [i.branch, { ...i, localOnly: false }]));
		for (const li of l.iterations) {
			const ri = have.get(li.branch);
			if (!ri) have.set(li.branch, { ...li, localOnly: true });
			else
				have.set(li.branch, {
					...ri,
					commit: ri.commit ?? li.commit,
					createdAt: ri.createdAt ?? li.createdAt,
					repository: ri.repository ?? li.repository,
					pullRequest: ri.pullRequest ?? li.pullRequest,
					// A picture made here leads: GitHub has it only once it is published.
					cover: li.cover ?? ri.cover,
					contributors: mergePeople(ri.contributors, li.contributors),
				});
		}
		byId.set(l.id, {
			...r,
			updatedAt: latestDate([r.updatedAt, l.updatedAt]),
			// A project shared before it had a brief shows its id; the local brief names it.
			title: r.title === r.id && l.title !== l.id ? l.title : r.title,
			// This machine's brief, when it has one: it is the one last written here, and the records sync fits it onto
			// GitHub's before every push, so it is never behind for longer than a sync. GitHub's otherwise.
			folder: l.records.includes('brief.md') ? (l.folder ?? null) : (r.folder ?? null),
			records: [...new Set([...r.records, ...l.records])].sort(),
			iterations: [...have.values()].sort(newestFirst),
			people: mergePeople(r.people, l.people, ...[...have.values()].map((i) => i.contributors)),
		});
	}
	return [...byId.values()].sort(newestProjectFirst);
};

/**
 * Two lists of the same machine's work -- records on disk, and branches in git --
 * as one. Records lead, because they carry what a branch cannot (a preview
 * address); a branch with no record is still work, and is added.
 */
export const unionLocal = (records: Project[], branches: Project[]): Project[] => {
	const byId = new Map<string, Project>(records.map((p) => [p.id, p]));
	for (const b of branches) {
		const r = byId.get(b.id);
		if (!r) {
			byId.set(b.id, b);
			continue;
		}
		const have = new Map(r.iterations.map((i) => [i.branch, i]));
		for (const bi of b.iterations) {
			const ri = have.get(bi.branch);
			have.set(
				bi.branch,
				ri
					? {
							...ri,
							commit: bi.commit ?? ri.commit,
							createdAt: ri.createdAt ?? bi.createdAt,
							contributors: mergePeople(ri.contributors, bi.contributors),
						}
					: bi,
			);
		}
		const its = [...have.values()].sort(newestFirst);
		byId.set(b.id, { ...r, iterations: its, people: mergePeople(r.people, ...its.map((i) => i.contributors)) });
	}
	return [...byId.values()];
};

/** Prototype iterations newest first, then the codebase work. */
export const newestFirst = (a: ProjectIteration, b: ProjectIteration): number => {
	const codebase = (x: ProjectIteration) => (workKind(x) === 'codebase' ? 1 : 0);
	return codebase(a) - codebase(b) || b.name.localeCompare(a.name, undefined, { numeric: true });
};

/**
 * The picture a project's card shows: its newest prototype's, else the newest earlier one that has a picture, so a card
 * never goes empty while a picture exists. None for a project with no picture, or with only codebase work.
 */
export const coverToShow = (project: Pick<Project, 'iterations'>): { name: string; cover: string } | null => {
	const pictured = workOf(project.iterations, 'prototype').find((i) => asCover(i.cover) !== null);
	return pictured ? { name: pictured.name, cover: pictured.cover as string } : null;
};

/**
 * What pressing a project does, the same for its card and its row: into its newest prototype in the app; or, for a project
 * with only codebase work, out to that work on GitHub, in the browser; or nothing, for a project with neither (nothing made
 * yet, or codebase work whose record does not say where it is). `label` names it, for a screen reader.
 */
export type ProjectOpening = { kind: 'app'; label: string; iteration: ProjectIteration } | { kind: 'link'; label: string; url: string };

export const projectOpening = (project: Pick<Project, 'title' | 'iterations'>): ProjectOpening | null => {
	const newest = workOf(project.iterations, 'prototype')[0];
	if (newest !== undefined) return { kind: 'app', label: `Open ${project.title}`, iteration: newest };
	const url = projectCodeLink(project);
	return url === null ? null : { kind: 'link', label: `Open ${project.title} on GitHub`, url };
};

/** The list with pictures just made taken in, and nothing else changed: the same list when there are none. */
export const withCovers = (projects: Project[], made: MadeCover[]): Project[] => {
	if (made.length === 0) return projects;
	const cover = (projectId: string, name: string) => made.find((m) => m.projectId === projectId && m.name === name)?.cover;
	return projects.map((p) =>
		made.some((m) => m.projectId === p.id) ? { ...p, iterations: p.iterations.map((i) => ({ ...i, cover: cover(p.id, i.name) ?? i.cover })) } : p,
	);
};
