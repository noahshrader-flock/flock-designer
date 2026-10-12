import type { Iteration, IterationKind, MadeCover, Person, Project, ProjectIteration } from './contract';
import { isBot, mergePeople } from './people';
import { matchesWords } from './search';

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
 * A project's **folder** (the folders plan): a label, kept in its brief's front matter, a `---` block at the very top:
 *
 *     ---
 *     folder: Admin
 *     ---
 *     # Alert history
 *
 * Read and written only here, so where the folder is kept can change in one place. A project id never holds its folder.
 */
const FRONT_MATTER = /^---\r?\n((?:.*\r?\n)*?)---\r?\n/;
const FOLDER_LINE = /^folder:(.*)$/;

/** A folder's name as it is kept: trimmed, runs of spaces made one, at most 60 characters; null when nothing is left. */
export const folderName = (v: unknown): string | null => {
	if (typeof v !== 'string') return null;
	const name = v.replace(/\s+/g, ' ').trim().slice(0, 60).trim();
	return name === '' ? null : name;
};

/** The lines of a brief's front matter, and the rest of the brief after it; no lines when it has none. */
const frontMatterOf = (markdown: string): { lines: string[]; body: string } => {
	const m = FRONT_MATTER.exec(markdown);
	return m ? { lines: (m[1] as string).split(/\r?\n/).filter((l) => l !== ''), body: markdown.slice(m[0].length) } : { lines: [], body: markdown };
};

/** The folder a brief says its project is in, or null. */
export const briefFolder = (markdown: string): string | null => {
	const line = frontMatterOf(markdown).lines.find((l) => FOLDER_LINE.test(l));
	return line === undefined ? null : folderName(FOLDER_LINE.exec(line)?.[1]);
};

/** Whether two folder names are one folder: they differ, if at all, only by case. */
export const sameFolder = (a: string, b: string): boolean => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;

/** The folders projects are in, each once whatever its case (as the first project in the list spells it), in order. */
export const foldersOf = (projects: Project[]): string[] => {
	const folders: string[] = [];
	for (const p of projects) if (p.folder && !folders.some((f) => sameFolder(f, p.folder as string))) folders.push(p.folder);
	return folders.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
};

/** Whether a project is in the folder chosen: any for none chosen (`undefined`), none for `null`, else that folder. */
export const inFolder = (project: Project, folder: string | null | undefined): boolean =>
	folder === undefined ? true : folder === null ? !project.folder : !!project.folder && sameFolder(project.folder, folder);

/** What a project's brief says of it: its title (the brief's heading, or the id when there is none) and its folder. */
export const fromBrief = (projectId: string, brief: string | null): { title: string; folder: string | null } =>
	brief === null ? { title: projectId, folder: null } : { title: firstHeading(brief) ?? projectId, folder: briefFolder(brief) };

/** A brief as a person reads it: without its front matter. */
export const briefBody = (markdown: string): string => frontMatterOf(markdown).body;

/** A record's text as a person is shown it: the brief without its front matter, every other record as it is. */
export const shownRecord = (name: string, text: string): string => (name === 'brief.md' ? briefBody(text) : text);

/**
 * A brief with its project in `folder`, or in none for null: only the folder's line changes, anything else in the front
 * matter is kept, and a brief left with nothing in it is as it was before it had a folder.
 */
export const withFolder = (markdown: string, folder: string | null): string => {
	const { lines, body } = frontMatterOf(markdown);
	const name = folderName(folder);
	const others = lines.filter((l) => !FOLDER_LINE.test(l));
	const kept = name === null ? others : [...others, `folder: ${name}`];
	return kept.length === 0 ? body : `---\n${kept.join('\n')}\n---\n${body}`;
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

/** The latest of some dates, ignoring anything that is not one; null when none is. */
export const latestDate = (dates: unknown[]): string | null =>
	dates.map(asDate).filter((d): d is string => d !== null).sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

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
	[...projects].sort((a, b) => {
		if (order === 'alphabetical') return byName(a, b);
		const da = lastUpdated(a);
		const db = lastUpdated(b);
		if (da !== null && db !== null && da !== db) return Date.parse(db) - Date.parse(da);
		if ((da === null) !== (db === null)) return da === null ? 1 : -1;
		return byName(a, b);
	});

/**
 * Whether a project is what a search is for: every word typed is somewhere in its name, its id, its folder, or the name or
 * GitHub login of someone who worked on it, without regard to case. Plain text, never a pattern; an empty search is
 * every project.
 */
export const matchesProject = (project: Project, search: string): boolean =>
	matchesWords([project.title, project.id, project.folder ?? '', ...project.people.flatMap((p) => [p.name, p.login ?? ''])].join('\n'), search);

/** Newest project first. A project with no known date goes last, and ties fall back to the title so the order never shuffles. */
export const newestProjectFirst = (a: Project, b: Project): number => {
	const da = startedAt(a);
	const db = startedAt(b);
	if (da !== null && db !== null && da !== db) return Date.parse(db) - Date.parse(da);
	if ((da === null) !== (db === null)) return da === null ? 1 : -1;
	return byName(a, b);
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
			else
				have.set(li.branch, {
					...ri,
					commit: ri.commit ?? li.commit,
					createdAt: ri.createdAt ?? li.createdAt,
					repository: ri.repository ?? li.repository ?? null,
					pullRequest: ri.pullRequest ?? li.pullRequest ?? null,
					// A picture made here leads: GitHub has it only once it is published.
					cover: li.cover ?? ri.cover ?? null,
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
/** A repository on GitHub, by its `owner/repo`: GitHub's own characters, and never `.` or `..`. */
const isGitHubRepository = (s: unknown): s is string => typeof s === 'string' && /^[\w.-]+\/[\w.-]+$/.test(s) && !s.split('/').some((p) => p === '.' || p === '..');
const PULL_REQUEST = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/;
/** A repository as a record gives it, or null when it is anything else. */
export const asGitHubRepository = (v: unknown): string | null => (isGitHubRepository(v) ? v : null);
/** A pull request's address as a record gives it, or null when it is not one of GitHub's. */
export const asPullRequest = (v: unknown): string | null => (typeof v === 'string' && PULL_REQUEST.test(v) ? v : null);

/**
 * Where codebase work is on GitHub, for anyone to open whether or not they have the repository: its pull request when
 * one is recorded, else its branch in the repository the record names. Null when the record says neither.
 */
export const codeLink = (it: { branch: string; repository?: string | null; pullRequest?: string | null }): string | null => {
	const pr = asPullRequest(it.pullRequest);
	if (pr) return pr;
	const repo = asGitHubRepository(it.repository);
	return repo ? `https://github.com/${repo}/tree/${it.branch.split('/').map(encodeURIComponent).join('/')}` : null;
};

/** Where a project's codebase work is on GitHub (`codeLink`), or null when it has none, or its record does not say. */
export const projectCodeLink = (project: { iterations: { name: string; branch: string; repository?: string | null; pullRequest?: string | null }[] }): string | null => {
	const codebase = project.iterations.find((it) => workKind(it) === 'codebase');
	return codebase ? codeLink(codebase) : null;
};

/** A project file as it reads in a menu: `design-notes.md` is "Design notes". */
export const recordLabel = (name: string): string => {
	const words = name.replace(/\.[^.]+$/, '').replace(/-/g, ' ');
	return words.charAt(0).toUpperCase() + words.slice(1);
};
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
/** A project's folder in the design repository: the one place a project's path is built (the folders plan's rule 3). */
export const projectDir = (projectId: string): string => `projects/${projectId}`;

/** A file in a project's folder in the design repository, by its path from the repository's root. */
export const projectPath = (projectId: string, file: string): string => `${projectDir(projectId)}/${file}`;
/** Where a prototype's page is kept in the design repository. */
export const prototypePagePath = (projectId: string, name: string): string => projectPath(projectId, `prototypes/${name}.html`);
/** Its React source, kept beside the page. */
export const prototypeSourcePath = (projectId: string, name: string): string => projectPath(projectId, `prototypes/${name}.tsx`);

/** A picture's hash, as a record names it (`prototypeVersionOf` of the page): twelve lower-case hex digits, nothing else. */
const COVER = /^[0-9a-f]{12}$/;
/** The hash a record gives a prototype's picture, or null when it gives none or anything else. */
export const asCover = (v: unknown): string | null => (typeof v === 'string' && COVER.test(v) ? v : null);
/** Refuses anything but a picture's hash: a path is built from it, and it comes from a record or the window. */
export const assertCover = (v: unknown): void => {
	if (asCover(v) === null) throw new Error('That is not the name of a picture.');
};
/**
 * Where a prototype's picture is kept in the design repository: in its project's `covers/` folder (a folder, so a picture
 * is never one of the project's documents), named by the prototype and the hash of the page it is of, so a file never
 * changes under its name.
 */
export const coverPath = (projectId: string, name: string, cover: string): string => {
	assertCover(cover);
	return projectPath(projectId, `covers/${name}-${cover}.jpg`);
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
		made.some((m) => m.projectId === p.id) ? { ...p, iterations: p.iterations.map((i) => ({ ...i, cover: cover(p.id, i.name) ?? i.cover ?? null })) } : p,
	);
};
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
/**
 * Where an iteration is on the published site, from the site's root: `<project>/v1/i2/`. The one place the site's
 * addresses are made, for the site itself, the command that publishes it and the app that opens it. Null for a name
 * that is not a prototype's.
 */
export const sitePath = (projectId: string, name: string): string | null => {
	const p = parsePrototypeName(name);
	return p ? `${projectId}/v${p.version}/i${p.iteration}/` : null;
};
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
 * unknown is frozen by any comment rather than changed under it. A bot is not someone who saw it.
 */
export const hasOutsideComments = (makers: Person[] | undefined, authors: string[]): boolean => {
	const own = new Set((makers ?? []).flatMap((p) => (p.login ? [p.login.toLowerCase()] : [])));
	return authors.some((a) => !isBot(a) && !own.has(a.toLowerCase()));
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
export const byVersion = <T extends { name: string }>(iterations: T[]): { version: number; iterations: T[] }[] => {
	const groups = new Map<number, T[]>();
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
	openComments: 0,
	previewUrl: null,
	route: null,
	commit: it.commit,
	contributors: it.contributors ?? [],
	createdAt: it.createdAt,
});
