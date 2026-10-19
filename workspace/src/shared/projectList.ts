import type { MadeCover, Project, ProjectWork } from './contract';
import { mergePeople } from './people';
import { matchesWords } from './search';
import { asCover, asDate } from './validate';
import { projectCodeLink, workKind, workOf } from './work';
import { newestVersionFirst } from './prototypeNames';
import { byNewest } from './sort';
import { HOST } from './vocabulary';

/** `order` 1 is the earliest, -1 the latest; anything that is not a date is ignored. */
const firstDate = (dates: unknown[], order: 1 | -1): string | null =>
	dates
		.map(asDate)
		.filter((d): d is string => d !== null)
		.sort((a, b) => order * (Date.parse(a) - Date.parse(b)))[0] ?? null;

export const latestDate = (dates: unknown[]): string | null => firstDate(dates, -1);

export const startedAt = (p: Pick<Project, 'work'>): string | null =>
	firstDate(
		p.work.map((i) => i.createdAt),
		1,
	);

export const lastUpdated = (p: Pick<Project, 'work'> & { updatedAt?: string | null }): string | null =>
	latestDate([p.updatedAt, ...p.work.map((i) => i.createdAt)]);

const byName = (a: Project, b: Project): number => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);

export type ProjectOrder = 'updated' | 'alphabetical';

export const sortProjects = (projects: Project[], order: ProjectOrder): Project[] =>
	[...projects].sort(order === 'alphabetical' ? byName : byNewest(lastUpdated, byName));

export const matchesProject = (project: Project, search: string): boolean =>
	matchesWords([project.title, project.id, project.folder ?? '', ...project.people.flatMap((p) => [p.name, p.login ?? ''])].join('\n'), search);

export const newestProjectFirst = byNewest(startedAt, byName);

/**
 * Work built here shows here whether or not it is shared, so what is only here is marked, not hidden. Where both know a
 * project, GitHub's copy leads (it is what everyone sees) and local facts only fill its gaps.
 */
export const mergeProjects = (remote: Project[], local: Project[]): Project[] => {
	const byId = new Map<string, Project>();
	for (const p of remote) byId.set(p.id, { ...p, localOnly: false });

	for (const l of local) {
		const r = byId.get(l.id);
		if (!r) {
			byId.set(l.id, { ...l, localOnly: true, work: l.work.map((i) => ({ ...i, localOnly: true })) });
			continue;
		}
		const have = new Map<string, ProjectWork>(r.work.map((i) => [i.branch, { ...i, localOnly: false }]));
		for (const li of l.work) {
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
			work: [...have.values()].sort(workOrder),
			people: mergePeople(r.people, l.people, ...[...have.values()].map((i) => i.contributors)),
		});
	}
	return [...byId.values()].sort(newestProjectFirst);
};

/**
 * Records lead, because they carry what a branch cannot (a preview address); a branch with no record is still work, and is
 * added.
 */
export const unionLocal = (records: Project[], branches: Project[]): Project[] => {
	const byId = new Map<string, Project>(records.map((p) => [p.id, p]));
	for (const b of branches) {
		const r = byId.get(b.id);
		if (!r) {
			byId.set(b.id, b);
			continue;
		}
		const have = new Map(r.work.map((i) => [i.branch, i]));
		for (const bi of b.work) {
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
		const its = [...have.values()].sort(workOrder);
		byId.set(b.id, { ...r, work: its, people: mergePeople(r.people, ...its.map((i) => i.contributors)) });
	}
	return [...byId.values()];
};

export const workOrder = (a: ProjectWork, b: ProjectWork): number => {
	const codebase = (x: ProjectWork) => (workKind(x) === 'codebase' ? 1 : 0);
	return codebase(a) - codebase(b) || newestVersionFirst(a.name, b.name);
};

/** Falls back to the newest earlier version that has one, so a card never goes empty while a picture exists. */
export const coverToShow = (project: Pick<Project, 'work'>): { name: string; cover: string } | null => {
	const pictured = workOf(project.work, 'prototype').find((i) => asCover(i.cover) !== null);
	return pictured ? { name: pictured.name, cover: pictured.cover as string } : null;
};

/** `label` names it, for a screen reader. */
export type ProjectOpening = { kind: 'app'; label: string; work: ProjectWork } | { kind: 'link'; label: string; url: string };

export const projectOpening = (project: Pick<Project, 'title' | 'work'>): ProjectOpening | null => {
	const newest = workOf(project.work, 'prototype')[0];
	if (newest !== undefined) return { kind: 'app', label: `Open ${project.title}`, work: newest };
	const url = projectCodeLink(project);
	return url === null ? null : { kind: 'link', label: `Open ${project.title} on ${HOST}`, url };
};

/** The same list, not a copy, when none were made. */
export const withCovers = (projects: Project[], made: MadeCover[]): Project[] => {
	if (made.length === 0) return projects;
	const cover = (projectId: string, name: string) => made.find((m) => m.projectId === projectId && m.name === name)?.cover;
	return projects.map((p) =>
		made.some((m) => m.projectId === p.id) ? { ...p, work: p.work.map((i) => ({ ...i, cover: cover(p.id, i.name) ?? i.cover })) } : p,
	);
};

export const openCommentsOf = (work: Pick<ProjectWork, 'openComments'>[]): number => work.reduce((n, i) => n + i.openComments, 0);
