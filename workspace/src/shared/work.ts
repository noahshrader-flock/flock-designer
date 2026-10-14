import type { IterationKind, ProjectIteration } from './contract';
import { isPrototypeKey } from './designPaths';
import { byNewest } from './sort';
import { parsePrototypeName } from './prototypeNames';
import { asRepositoryPath } from './repoRef';
import { asChangeRequestUrl, treeUrl } from './hostUrls';

/** The two kinds of work, prototypes and codebase work, and where a project's work is in code. */

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
	iterations: { name: string; branch: string; repository?: string | null; pullRequest?: string | null }[];
}): string | null => {
	const codebase = project.iterations.find((it) => workKind(it) === 'codebase');
	return codebase ? codeLink(codebase) : null;
};

/** Which kind of work an iteration is: codebase work is the one named `codebase` on a branch; anything else is a prototype. */
export const workKind = (i: Pick<ProjectIteration, 'name' | 'branch'>): IterationKind =>
	!isPrototypeKey(i.branch) && i.name === 'codebase' ? 'codebase' : 'prototype';

const newestStarted = byNewest<ProjectIteration>(
	(it) => it.createdAt || null,
	(a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }),
);

/**
 * A project's work as the screens offer it: its **prototypes** (pages, and the older ones on `fd/` branches: attempts
 * to decide what something should be, kept or carried into the code) and its **codebase** work, the real change. Each
 * is newest first, so the first is what "View prototype" and "View codebase" open, and the rest are the iterations to
 * switch to.
 */
export const workOf = (iterations: ProjectIteration[], kind: IterationKind): ProjectIteration[] =>
	iterations.filter((i) => workKind(i) === kind).sort(newestStarted);

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
 * What a person is told when codebase work's branch has no DSNR setup: DSNR could not read what it may run in the branch
 * it moved the checkout to, so it does not move it. One sentence for every screen that says it.
 */
export const noSetupNote = (branch: string): string =>
	`${branch} has no DSNR setup (.dsnr/workspace.json), so DSNR cannot work in it. Merge a branch that has the DSNR setup into it first.`;
