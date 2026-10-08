import type { Iteration, IterationKind, Person, Project, ProjectIteration } from './contract';
import { mergePeople } from './people';

/** The only shape a project id may take: lower-case words joined by single hyphens. */
export const PROJECT_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** `# Title` from a brief, or null. The project id is used when there is none. */
export const firstHeading = (markdown: string): string | null => {
	for (const line of markdown.split('\n')) {
		const m = /^#\s+(.+?)\s*$/.exec(line);
		if (m?.[1]) return m[1];
	}
	return null;
};

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

/** A date from a record or from git, or null: anything that does not parse is not a date. */
export const asDate = (v: unknown): string | null => (typeof v === 'string' && v !== '' && !Number.isNaN(Date.parse(v)) ? v : null);

/**
 * Where in the running app an iteration's work actually is, as a path within it -- `/roles/compare`,
 * or `roles/compare?state=error`. Null when the record does not say, and the preview opens at the
 * app's own front door as before.
 *
 * **This comes out of a file an agent wrote, so it is checked, not trusted.** It is joined onto
 * `http://localhost:<port>` to make the address the preview loads, so anything that could leave that
 * origin is refused rather than corrected: a scheme (`javascript:`, `http:`), a host (`//evil.test`),
 * or a backslash, which some parsers read as a slash. What is left is a path on the preview itself.
 */
export const asRoute = (v: unknown): string | null => {
	if (typeof v !== 'string') return null;
	const raw = v.trim();
	if (raw === '' || raw.length > 300) return null;
	// No scheme, no authority, no backslash, no control characters, no whitespace.
	if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
	if (raw.startsWith('//') || raw.includes('\\')) return null;
	// eslint-disable-next-line no-control-regex
	if (/[\u0000- \u007f]/.test(raw)) return null;
	const path = raw.startsWith('/') ? raw : `/${raw}`;
	// `..` cannot escape the origin, but a route that climbs is a mistake in the record, not a landing place.
	if (path.split(/[/?#]/).includes('..')) return null;
	// A route pattern is not a route. `/organization/:id/roles` and `/org/{id}/roles` are what a router
	// matches against; as an address they are taken literally and match nothing, so the preview would
	// open on an error page that looks like the work failed. Refusing it here means the iteration opens
	// where it always did instead, and the skill says to record the form with no parameters in it.
	if (/\/:[^/]|[{}*]/.test(path)) return null;
	return path;
};

/** When a project was started: its earliest iteration's date, or null if none has one. */
export const startedAt = (p: Pick<Project, 'iterations'>): string | null =>
	p.iterations
		.map((i) => i.createdAt)
		.filter((d): d is string => d !== null)
		.sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;

/** Newest project first. A project with no known date goes last, and ties fall back to the title so the order never shuffles. */
export const newestProjectFirst = (a: Project, b: Project): number => {
	const da = startedAt(a);
	const db = startedAt(b);
	if (da !== null && db !== null && da !== db) return Date.parse(db) - Date.parse(da);
	if ((da === null) !== (db === null)) return da === null ? 1 : -1;
	return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id);
};

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
			else have.set(li.branch, { ...ri, commit: ri.commit ?? li.commit, createdAt: ri.createdAt ?? li.createdAt, contributors: mergePeople(ri.contributors, li.contributors) });
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
			have.set(bi.branch, ri ? { ...ri, commit: bi.commit ?? ri.commit, createdAt: ri.createdAt ?? bi.createdAt, contributors: mergePeople(ri.contributors, bi.contributors) } : bi);
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
 * One plain file or folder name, never a path. Project ids and record names reach the main process from the window and
 * are joined onto a folder or a repository address, so they are checked before they are used for either.
 */
export const isRecordName = (n: unknown): n is string => typeof n === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(n) && !n.includes('..');

/**
 * A prototype: one self-contained page, made without running the product, saved in the design repository beside
 * the project's other records. It has no git branch. Its key, in the place a branch name goes (the iteration
 * record, the review thread), is `prototype/<project-id>/<name>`, which no repository's branch pattern makes, so it
 * can never be mistaken for one. (The older prototypes on `fd/` branches have a branch, not a key.)
 */
const PROTOTYPE_PREFIX = 'prototype/';
export const isPrototypeKey = (branch: string): boolean => branch.startsWith(PROTOTYPE_PREFIX);
export const prototypeKey = (projectId: string, name: string): string => `${PROTOTYPE_PREFIX}${projectId}/${name}`;
/** A file in a project's folder in the design repository, by its path from the repository's root. */
export const projectPath = (projectId: string, file: string): string => `projects/${projectId}/${file}`;
/** Where a prototype's page is kept in the design repository. */
export const prototypePagePath = (projectId: string, name: string): string => projectPath(projectId, `prototypes/${name}.html`);
/** Its React source, kept beside the page. */
export const prototypeSourcePath = (projectId: string, name: string): string => projectPath(projectId, `prototypes/${name}.tsx`);
/**
 * A prototype's name says which **version** it belongs to (a different idea for the same brief) and which
 * **iteration** of that version it is (a refinement): `v2-i3`. Names from before versions, `i1`, `i2`, are version 1,
 * and keep the key, files and review thread they have always had: nothing is renamed. This is the one place a name is
 * read, so everything that checks or counts one agrees.
 */
const PROTOTYPE_NAME = /^(?:v([1-9]\d{0,2})-)?i([1-9]\d{0,3})$/;
export interface PrototypeName {
	version: number;
	iteration: number;
	/** Written before versions existed (`i1`): read as version 1. */
	legacy: boolean;
}
export const parsePrototypeName = (name: string): PrototypeName | null => {
	const m = PROTOTYPE_NAME.exec(name);
	return m ? { version: Number(m[1] ?? 1), iteration: Number(m[2]), legacy: m[1] === undefined } : null;
};
export const isPrototypeName = (name: string): boolean => parsePrototypeName(name) !== null;
/** A name in the new form. Only reading accepts the old one. */
export const prototypeName = (version: number, iteration: number): string => `v${version}-i${iteration}`;
const parsedNames = (names: string[]): PrototypeName[] => names.map(parsePrototypeName).filter((p): p is PrototypeName => p !== null);
/** A new idea for the project: the first iteration of the next version, one past the highest, so no number is reused. */
export const nextPrototypeName = (names: string[]): string =>
	prototypeName(parsedNames(names).reduce((max, p) => Math.max(max, p.version), 0) + 1, 1);
/** A refinement of a version: its next iteration, one past the highest it has had. */
export const nextIterationName = (names: string[], version: number): string =>
	prototypeName(version, parsedNames(names).filter((p) => p.version === version).reduce((max, p) => Math.max(max, p.iteration), 0) + 1);
/** A version's newest iteration, by the name it was recorded under, or null when the version has none. */
export const latestIterationName = (names: string[], version: number): string | null => {
	let best: { name: string; iteration: number } | null = null;
	for (const name of names) {
		const p = parsePrototypeName(name);
		if (p && p.version === version && (best === null || p.iteration > best.iteration)) best = { name, iteration: p.iteration };
	}
	return best?.name ?? null;
};
/**
 * Whether anyone but an iteration's makers has commented on it. Once someone has, the iteration is **frozen**: what
 * they commented on is never changed under them, and the next change is made in the next iteration. Makers are known
 * by their GitHub login, as comment authors are; a maker with none is not anyone's, so an iteration whose makers are
 * unknown is frozen by any comment rather than changed under it.
 */
export const hasOutsideComments = (makers: Person[] | undefined, authors: string[]): boolean => {
	const own = new Set((makers ?? []).flatMap((p) => (p.login ? [p.login.toLowerCase()] : [])));
	return authors.some((a) => !own.has(a.toLowerCase()));
};

/**
 * A project's work as the screens offer it: its **prototypes** (pages, and the older ones on `fd/` branches: attempts
 * to decide what something should be, kept or carried into the code) and its **codebase** work, the real change. Each is newest first, so
 * the first is what "View prototype" and "View codebase" open, and the rest are the iterations to switch to.
 */
export const workKind = (i: Pick<ProjectIteration, 'name' | 'branch'>): IterationKind =>
	!isPrototypeKey(i.branch) && i.name === 'codebase' ? 'codebase' : 'prototype';
/**
 * How an iteration is named on screen: `V2 · I3`. A project's codebase work is one branch, so it is its first
 * iteration, and keeps that label.
 */
export const iterationLabel = (i: Pick<ProjectIteration, 'name' | 'branch'>): string => {
	if (workKind(i) === 'codebase') return 'I1';
	const p = parsePrototypeName(i.name);
	return p ? `V${p.version} · I${p.iteration}` : i.name.toUpperCase();
};
/**
 * A project's prototypes, version by version, for the switcher and the project page. Versions appear in the order of
 * their first iteration in the list given (so a newest-first list puts the newest idea first), iterations in the order
 * given within each.
 */
export const byVersion = (iterations: ProjectIteration[]): { version: number; iterations: ProjectIteration[] }[] => {
	const groups = new Map<number, ProjectIteration[]>();
	for (const it of iterations) {
		const p = parsePrototypeName(it.name);
		if (!p) continue;
		groups.set(p.version, [...(groups.get(p.version) ?? []), it]);
	}
	return [...groups].map(([version, its]) => ({ version, iterations: its }));
};
const newestStarted = (a: ProjectIteration, b: ProjectIteration): number =>
	(b.createdAt ? Date.parse(b.createdAt) : -Infinity) - (a.createdAt ? Date.parse(a.createdAt) : -Infinity) ||
	b.name.localeCompare(a.name, undefined, { numeric: true });
export const workOf = (iterations: ProjectIteration[], kind: IterationKind): ProjectIteration[] =>
	iterations.filter((i) => workKind(i) === kind).sort(newestStarted);

/** A just-made iteration as the screens show one: nothing shared or built yet, so nowhere to land. */
export const freshIteration = (it: Iteration): ProjectIteration => ({
	name: it.name,
	branch: it.branch,
	issueNumber: null,
	previewUrl: null,
	route: null,
	commit: it.commit,
	contributors: it.contributors ?? [],
	createdAt: it.createdAt,
});
