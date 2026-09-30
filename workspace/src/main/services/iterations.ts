import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Iteration, WorkspaceDescriptor } from '../../shared/contract';
import { checkoutBranch, createBranch, headCommit } from './git';
import { resolveInside } from './paths';

/**
 * Named attempts at the question, and the record of them.
 *
 * **The record does not live in the product checkout.** It lives in the design
 * repository, one folder per project, because the plan settled that and gave the
 * reason: a record on the prototype branch means picking up someone's work
 * requires knowing which branch to check out, and it needs a standing rule to
 * keep per-project state off `develop`.
 *
 * Writing it into the checkout also dirties the working tree, which then blocks
 * the next iteration on its own bookkeeping. That is how this was found.
 */

export class IterationProblem extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'IterationProblem';
	}
}

/**
 * Where the design records live, given a product checkout.
 *
 * Defaults to a sibling `flock-designer`, which is how the repository's own
 * `check-handoff.mjs` already finds them (`../flock-designer/projects`). Keeping
 * the two in step matters more than the default itself.
 */
export const defaultRecordsRoot = (productRoot: string): string =>
	join(dirname(resolve(productRoot)), 'flock-designer', 'projects');

/** `fd/<project-id>/i<n>` from the repository's own pattern, never hard-coded. */
export const branchFor = (descriptor: WorkspaceDescriptor, projectId: string, n: number): string =>
	descriptor.branchPattern.prototype.replace('<project-id>', projectId).replace('<n>', String(n));

/**
 * A project id becomes a directory and a branch name, so it is checked here
 * rather than trusted. Anything outside this set could escape either one.
 */
export const assertUsableProjectId = (projectId: string): void => {
	if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(projectId)) {
		throw new IterationProblem(
			`"${projectId}" is not a usable project id. Use lower-case words separated by hyphens, like "users-inactivity-signal".`,
		);
	}
};

const recordPath = (recordsRoot: string, projectId: string): string => {
	assertUsableProjectId(projectId);
	return resolveInside(recordsRoot, join(projectId, 'iterations.json'));
};

export const readIterations = (recordsRoot: string, projectId: string): Iteration[] => {
	const path = recordPath(recordsRoot, projectId);
	if (!existsSync(path)) {
		return [];
	}
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
		return Array.isArray(parsed) ? (parsed as Iteration[]) : [];
	} catch {
		throw new IterationProblem(`${join(projectId, 'iterations.json')} is not readable JSON.`);
	}
};

const writeIterations = (recordsRoot: string, projectId: string, iterations: Iteration[]): void => {
	const path = recordPath(recordsRoot, projectId);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, `${JSON.stringify(iterations, null, 2)}\n`);
};

export const createIteration = async (
	productRoot: string,
	recordsRoot: string,
	descriptor: WorkspaceDescriptor,
	projectId: string,
	note: string,
	from: string,
): Promise<Iteration> => {
	const existing = readIterations(recordsRoot, projectId);
	const n = existing.length + 1;
	const branch = branchFor(descriptor, projectId, n);

	// The branch is created first. If it fails -- a dirty tree, a name already
	// taken -- nothing has been recorded, so the record cannot claim an iteration
	// that does not exist.
	await createBranch(productRoot, branch, from);

	const iteration: Iteration = {
		projectId,
		name: `i${n}`,
		branch,
		commit: null,
		createdAt: new Date().toISOString(),
		note,
	};
	writeIterations(recordsRoot, projectId, [...existing, iteration]);
	return iteration;
};

export const continueIteration = async (
	productRoot: string,
	recordsRoot: string,
	projectId: string,
	name: string,
): Promise<Iteration> => {
	const iterations = readIterations(recordsRoot, projectId);
	const iteration = iterations.find((i) => i.name === name);
	if (!iteration) {
		throw new IterationProblem(`${projectId} has no iteration called ${name}.`);
	}
	await checkoutBranch(productRoot, iteration.branch);

	// Recorded on return, so the record tracks where the branch actually is
	// rather than where it started.
	const commit = await headCommit(productRoot);
	const updated = iterations.map((i) => (i.name === name ? { ...i, commit } : i));
	writeIterations(recordsRoot, projectId, updated);
	return { ...iteration, commit };
};
