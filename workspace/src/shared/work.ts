import type { BuildInCodebasePlan, WorkKind, Project, ProjectWork } from './contract';
import { newestVersionFirst, parseVersion } from './prototypeNames';
import { byNewest } from './sort';
import { asRepositoryPath } from './repoRef';
import { asChangeRequestUrl, treeUrl } from './hostUrls';

/** The two kinds of work, prototypes and codebase work, and where a project's work is in code. */

/** The command a product declares (`.dsnr/workspace.json`) to serve its own app on mock data, where codebase work is seen and measured. */
export const DESIGN_MODE_COMMAND = 'design-mode';

/**
 * Where codebase work is on GitHub, for anyone to open whether or not they have the repository: its pull request when
 * one is recorded, else its branch in the repository the record names. Null when the record says neither.
 */
export const codeLink = (it: { branch: string; repository?: string | null; pullRequest?: string | null }): string | null => {
	const pr = asChangeRequestUrl(it.pullRequest);
	if (pr) return pr;
	const repo = asRepositoryPath(it.repository);
	return repo ? treeUrl(repo, it.branch) : null;
};

/** Where a project's codebase work is on GitHub (`codeLink`), or null when it has none, or its record does not say. */
export const projectCodeLink = (project: {
	work: { name: string; branch: string; repository?: string | null; pullRequest?: string | null }[];
}): string | null => {
	const codebase = project.work.find((it) => workKind(it) === 'codebase');
	return codebase ? codeLink(codebase) : null;
};

/** Which kind of work a record is: codebase work is the one named `codebase`; every other is a version of the prototype. */
export const workKind = (i: Pick<ProjectWork, 'name'>): WorkKind => (i.name === 'codebase' ? 'codebase' : 'prototype');

/**
 * A project's work as the screens offer it: the versions of its **prototype** (pages: ideas for what something should
 * be, kept or carried into the code) and its **codebase** work, the real change. Each is newest first, so the first is
 * what "View prototype" and "View codebase" open, and the rest are the versions to switch to.
 */
export const workOf = (work: ProjectWork[], kind: WorkKind): ProjectWork[] =>
	work.filter((i) => workKind(i) === kind).sort((a, b) => newestVersionFirst(a.name, b.name));

/**
 * The products a project has work in (the workspace README's "Projects, by product"), each once, its newest work's first: a prototype's the
 * product it was made on, codebase work's its repository, both `owner/repo` on the host. None for work recorded before
 * products were kept: a clone's folder name is never taken for one, since it differs from machine to machine.
 */
export const productsOf = (project: Pick<Project, 'work'>): string[] => {
	const found: string[] = [];
	// Across both kinds, so by when each was started: a version and codebase work have no number in common.
	for (const it of [...project.work].sort(
		byNewest<ProjectWork>(
			(w) => w.createdAt || null,
			(a, b) => newestVersionFirst(a.name, b.name),
		),
	)) {
		const product = workKind(it) === 'codebase' ? it.repository : it.product;
		if (product && !found.includes(product)) found.push(product);
	}
	return found;
};

/** How a piece of work is named on screen: a version as `Version 2`, and codebase work as Codebase. */
export const workLabel = (i: Pick<ProjectWork, 'name'>): string =>
	workKind(i) === 'codebase' ? 'Codebase' : `Version ${parseVersion(i.name) ?? i.name}`;

/**
 * What a person is told when codebase work's branch has no DSNR setup: DSNR could not read what it may run in the branch
 * it moved the checkout to, so it does not move it. One sentence for every screen that says it.
 */
export const noSetupNote = (branch: string): string =>
	`${branch} has no DSNR setup (.dsnr/workspace.json), so DSNR cannot work in it. Merge a branch that has the DSNR setup into it first.`;

/**
 * What Build in the codebase does once Claude Code has the task, after the step that is each screen's own (where Claude
 * Code opens): said the same in the app and in VS Code, since the work is the same. Ends with the check it makes of its
 * own work, and what is left to Handoff.
 */
export const buildSteps = (continuing: boolean, branch: string): string[] => [
	continuing
		? 'The agent looks at what is already on the branch and its audit, then carries on from there.'
		: "The agent reads the prototype's source and its marks, and writes an audit first: a decision for each stand-in, a data task for each mock, a deletion for each removal.",
	`Then it builds the real thing in the files where it belongs, and commits on ${branch}. You see all of it there.`,
	'Before it reports, the implementation reviewer checks the work once, and what blocks is fixed. Product parity, the full reviews and the gate are Handoff’s.',
];

/** Where a new branch starts from: what the prototype was modeled on, when that can be; else where the checkout is; else the first that can. */
export const startBranch = (plan: Pick<BuildInCodebasePlan, 'basedOn' | 'current'>, startable: string[]): string | null =>
	[plan.basedOn?.branch, plan.current].find((b): b is string => typeof b === 'string' && startable.includes(b)) ?? startable[0] ?? null;

/**
 * Whether Build in the codebase can start, as both its dialogs (the app's, VS Code's) read its plan. Work already started
 * is continued where it is. A new branch, or moving to the branch from another, needs a clean checkout; already on it,
 * what is uncommitted is the work in progress, and is left alone. `uncommitted` says what to do, when it stands in the way.
 */
export const buildStart = (
	plan: Pick<BuildInCodebasePlan, 'branch' | 'current' | 'clean' | 'setup' | 'started'>,
	from: string | null,
): { continuing: boolean; canStart: boolean; uncommitted: string | null } => {
	const continuing = plan.started;
	const needsClean = !continuing || plan.current !== plan.branch;
	const uncommitted =
		needsClean && !plan.clean
			? continuing
				? `Your checkout is on ${plan.current ?? 'no branch'}, and moving it to ${plan.branch} needs a clean checkout. Commit or set them aside first.`
				: 'The work starts on a new branch, which needs a clean checkout. Commit or set them aside first.'
			: null;
	return { continuing, canStart: plan.setup && uncommitted === null && (continuing || from !== null), uncommitted };
};
