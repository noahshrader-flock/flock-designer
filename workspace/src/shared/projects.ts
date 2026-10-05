import type { Project, ProjectIteration } from './contract';

/** The only shape a project id may take: lower-case words joined by single hyphens. */
export const PROJECT_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * A name becomes a project id. Truncation happens before the trailing hyphen is
 * stripped, so a long name cannot produce an id the main process would reject --
 * which is what the renderer's own copy of this used to do.
 */
export const slugify = (name: string): string =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, 60)
		.replace(/^-+|-+$/g, '');

import { mergePeople } from './people';

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
			else have.set(li.branch, { ...ri, commit: ri.commit ?? li.commit, contributors: mergePeople(ri.contributors, li.contributors) });
		}
		byId.set(l.id, {
			...r,
			// A project shared before it had a brief shows its id; the local brief names it.
			title: r.title === r.id && l.title !== l.id ? l.title : r.title,
			records: [...new Set([...r.records, ...l.records])].sort(),
			iterations: [...have.values()].sort(newestFirst),
			people: mergePeople(r.people, l.people, ...[...have.values()].map((i) => i.contributors)),
		});
	}
	return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
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
			have.set(bi.branch, ri ? { ...ri, commit: bi.commit ?? ri.commit, contributors: mergePeople(ri.contributors, bi.contributors) } : bi);
		}
		const its = [...have.values()].sort(newestFirst);
		byId.set(b.id, { ...r, iterations: its, people: mergePeople(r.people, ...its.map((i) => i.contributors)) });
	}
	return [...byId.values()];
};

/** Prototype iterations newest first, then the codebase branch. */
export const newestFirst = (a: ProjectIteration, b: ProjectIteration): number => {
	const codebase = (x: ProjectIteration) => (x.branch.startsWith('fd/') ? 0 : 1);
	return codebase(a) - codebase(b) || b.name.localeCompare(a.name, undefined, { numeric: true });
};
