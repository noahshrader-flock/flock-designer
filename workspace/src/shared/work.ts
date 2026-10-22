import type { BranchAgainstBase, BuildInCodebasePlan, WorkKind, Project, ProjectWork } from './contract';
import { plural } from './plural';
import { newestVersionFirst, parseVersion } from './versionNames';
import { byNewest } from './sort';
import { asRepositoryPath } from './repoRef';
import { asChangeRequestUrl, treeUrl } from './hostUrls';

/** How codebase work's branch stands against its base, in the same words in the panel and in HANDOFF.md. */
export const againstBaseWords = ({ branch, base, behind, conflicts }: BranchAgainstBase): string =>
	behind === 0
		? `${branch} is up to date with ${base}.`
		: `${branch} is ${plural(behind, 'commit')} behind ${base}. ${conflicts.length === 0 ? `It merges into ${base} cleanly.` : `Merging ${base} into it conflicts in ${conflicts.join(', ')}.`}`;

/** Declared in `.dsnr/workspace.json` to serve the product's own app on mock data. */
export const DESIGN_MODE_COMMAND = 'design-mode';
/** Declared to run the light check, fast, after every step of codebase work. */
export const LIGHT_CHECK_COMMAND = 'check-iteration';
/** Declared to run the gate that says codebase work is fit for engineering. */
export const HANDOFF_COMMAND = 'handoff';
/** A declared command as it is shown to the person: its id, then what it runs. */
export const commandShown = ({ id, argv }: { id: string; argv: string[] }): string => `${id}: ${argv.join(' ')}`;

/** Its pull request when one is recorded, else its branch; null when the record says neither. */
export const codeLink = (it: { branch: string; repository?: string | null; pullRequest?: string | null }): string | null => {
	const pr = asChangeRequestUrl(it.pullRequest);
	if (pr) return pr;
	const repo = asRepositoryPath(it.repository);
	return repo ? treeUrl(repo, it.branch) : null;
};

export const projectCodeLink = (project: {
	work: { name: string; branch: string; repository?: string | null; pullRequest?: string | null }[];
}): string | null => {
	const codebase = project.work.find((it) => workKind(it) === 'codebase');
	return codebase ? codeLink(codebase) : null;
};

/** The versions with a page, newest first: one still building has none, and nothing of it is shared. */
export const savedVersions = (work: ProjectWork[]): ProjectWork[] => workOf(work, 'prototype').filter((i) => !i.building);

/** Started here and nothing of it saved yet: it has no page to open and nothing of it is shared. */
export const onlyBuilding = (project: Pick<Project, 'work'>): boolean => project.work.length > 0 && project.work.every((i) => i.building === true);

export const workKind = (i: Pick<ProjectWork, 'name'>): WorkKind => (i.name === 'codebase' ? 'codebase' : 'prototype');

/** Newest first, so the first is what "View prototype" and "View codebase" open. */
export const workOf = (work: ProjectWork[], kind: WorkKind): ProjectWork[] =>
	work.filter((i) => workKind(i) === kind).sort((a, b) => newestVersionFirst(a.name, b.name));

/**
 * Newest work's first. Work whose record names no product gives none: a clone's folder name is never taken for one, since
 * it differs from machine to machine.
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

export const workLabel = (i: Pick<ProjectWork, 'name'>): string =>
	workKind(i) === 'codebase' ? 'Codebase' : `Version ${parseVersion(i.name) ?? i.name}`;

export const noSetupNote = (branch: string): string =>
	`${branch} has no DSNR setup (.dsnr/workspace.json), so DSNR cannot work in it. Merge a branch that has the DSNR setup into it first.`;

/** After the step that is each screen's own (where the agent opens). */
export const buildSteps = (continuing: boolean, branch: string): string[] => [
	continuing
		? 'The agent looks at what is already on the branch and its audit, then carries on from there.'
		: "The agent reads the prototype's source and its marks, and writes an audit first: a decision for each stand-in, a data task for each mock, a deletion for each removal.",
	`Then it builds the real thing in the files where it belongs, and commits on ${branch}. You see all of it there.`,
	'Before it reports, the implementation reviewer checks the work once, and what blocks is fixed. Product parity, the full reviews and the gate are Handoff’s.',
];

/** What the prototype was modeled on, when that can be; else where the checkout is; else the first that can. */
export const startBranch = (plan: Pick<BuildInCodebasePlan, 'basedOn' | 'current'>, startable: string[]): string | null =>
	[plan.basedOn?.branch, plan.current].find((b): b is string => typeof b === 'string' && startable.includes(b)) ?? startable[0] ?? null;

/**
 * A new branch, or moving to the branch from another, needs a clean checkout; already on it, what is uncommitted is the
 * work in progress, and is left alone.
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

/**
 * The work's own route, so a comment is not made on the product's front door by mistake; a route that would move the
 * origin is refused, not followed.
 */
export const routeIn = (previewUrl: string, route: string | null | undefined): string => {
	if (!route) return previewUrl;
	try {
		const base = new URL(previewUrl);
		const at = new URL(route, base);
		return at.origin === base.origin ? at.href : previewUrl;
	} catch {
		return previewUrl;
	}
};
