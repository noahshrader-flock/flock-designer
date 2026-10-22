import type { MadeCover, Prototype, PrototypeWork } from './contract';
import { mergePeople } from './people';
import { matchesWords } from './search';
import { asCover, asDate } from './validate';
import { prototypeCodeLink, workKind, workOf } from './work';
import { newestVersionFirst } from './versionNames';
import { byNewest } from './sort';
import { HOST } from './vocabulary';

/** `order` 1 is the earliest, -1 the latest; anything that is not a date is ignored. */
const firstDate = (dates: unknown[], order: 1 | -1): string | null =>
	dates
		.map(asDate)
		.filter((d): d is string => d !== null)
		.sort((a, b) => order * (Date.parse(a) - Date.parse(b)))[0] ?? null;

export const latestDate = (dates: unknown[]): string | null => firstDate(dates, -1);

export const startedAt = (p: Pick<Prototype, 'work'>): string | null =>
	firstDate(
		p.work.map((i) => i.createdAt),
		1,
	);

export const lastUpdated = (p: Pick<Prototype, 'work'> & { updatedAt?: string | null }): string | null =>
	latestDate([p.updatedAt, ...p.work.map((i) => i.createdAt)]);

const byName = (a: Prototype, b: Prototype): number => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);

export type PrototypeOrder = 'updated' | 'alphabetical';

export const sortPrototypes = (prototypes: Prototype[], order: PrototypeOrder): Prototype[] =>
	[...prototypes].sort(order === 'alphabetical' ? byName : byNewest(lastUpdated, byName));

export const matchesPrototype = (prototype: Prototype, search: string): boolean =>
	matchesWords(
		[prototype.title, prototype.id, prototype.folder ?? '', ...prototype.people.flatMap((p) => [p.name, p.login ?? ''])].join('\n'),
		search,
	);

export const newestPrototypeFirst = byNewest(startedAt, byName);

/**
 * Work built here shows here whether or not it is shared, so what is only here is marked, not hidden. Where both know a
 * prototype, GitHub's copy leads (it is what everyone sees) and local facts only fill its gaps.
 */
export const mergePrototypes = (remote: Prototype[], local: Prototype[]): Prototype[] => {
	const byId = new Map<string, Prototype>();
	for (const p of remote) byId.set(p.id, { ...p, localOnly: false });

	for (const l of local) {
		const r = byId.get(l.id);
		if (!r) {
			byId.set(l.id, { ...l, localOnly: true, work: l.work.map((i) => ({ ...i, localOnly: true })) });
			continue;
		}
		const have = new Map<string, PrototypeWork>(r.work.map((i) => [i.branch, { ...i, localOnly: false }]));
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
			// A prototype shared before it had a brief shows its id; the local brief names it.
			title: r.title === r.id && l.title !== l.id ? l.title : r.title,
			// This machine's brief, when it has one: it is the one last written here, and the records sync fits it onto
			// GitHub's before every push, so it is never behind for longer than a sync. GitHub's otherwise.
			folder: l.records.includes('brief.md') ? (l.folder ?? null) : (r.folder ?? null),
			records: [...new Set([...r.records, ...l.records])].sort(),
			work: [...have.values()].sort(workOrder),
			people: mergePeople(r.people, l.people, ...[...have.values()].map((i) => i.contributors)),
		});
	}
	return [...byId.values()].sort(newestPrototypeFirst);
};

/**
 * Records lead, because they carry what a branch cannot (a preview address); a branch with no record is still work, and is
 * added.
 */
export const unionLocal = (records: Prototype[], branches: Prototype[]): Prototype[] => {
	const byId = new Map<string, Prototype>(records.map((p) => [p.id, p]));
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

export const workOrder = (a: PrototypeWork, b: PrototypeWork): number => {
	const codebase = (x: PrototypeWork) => (workKind(x) === 'codebase' ? 1 : 0);
	return codebase(a) - codebase(b) || newestVersionFirst(a.name, b.name);
};

/** Falls back to the newest earlier version that has one, so a card never goes empty while a picture exists. */
export const coverToShow = (prototype: Pick<Prototype, 'work'>): { name: string; cover: string } | null => {
	const pictured = workOf(prototype.work, 'prototype').find((i) => asCover(i.cover) !== null);
	return pictured ? { name: pictured.name, cover: pictured.cover as string } : null;
};

/** `label` names it, for a screen reader. */
export type PrototypeOpening = { kind: 'app'; label: string; work: PrototypeWork } | { kind: 'link'; label: string; url: string };

export const prototypeOpening = (prototype: Pick<Prototype, 'title' | 'work'>): PrototypeOpening | null => {
	const newest = workOf(prototype.work, 'prototype')[0];
	if (newest !== undefined) return { kind: 'app', label: `Open ${prototype.title}`, work: newest };
	const url = prototypeCodeLink(prototype);
	return url === null ? null : { kind: 'link', label: `Open ${prototype.title} on ${HOST}`, url };
};

/** The same list, not a copy, when none were made. */
export const withCovers = (prototypes: Prototype[], made: MadeCover[]): Prototype[] => {
	if (made.length === 0) return prototypes;
	const cover = (prototypeId: string, name: string) => made.find((m) => m.prototypeId === prototypeId && m.name === name)?.cover;
	return prototypes.map((p) =>
		made.some((m) => m.prototypeId === p.id) ? { ...p, work: p.work.map((i) => ({ ...i, cover: cover(p.id, i.name) ?? i.cover })) } : p,
	);
};

export const openCommentsOf = (work: Pick<PrototypeWork, 'openComments'>[]): number => work.reduce((n, i) => n + i.openComments, 0);
