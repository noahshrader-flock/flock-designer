import type { IterationKind, ProjectIteration } from './contract';
import { isPrototypeKey } from './designPaths';
import { asGitHubRepository, asPullRequest } from './validate';
import { byNewest } from './sort';
import { parsePrototypeName } from './prototypeNames';

/** The two kinds of work, prototypes and codebase work, and where a project's work is in code. */

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
