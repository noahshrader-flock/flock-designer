import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Iteration, Person, WorkspaceDescriptor } from '../../shared/contract';
import { branchAuthors, branchExists, branchStartedAt, checkoutBranch, createBranch, headCommit, isSamePerson, localIdentity } from './git';
import { loginFromNoreply } from '../../shared/people';
import { resolveInside } from './paths';
import { gitHubRepoOf, originOf } from './repositories';
import { PROJECT_ID, parsePrototypeName } from '../../shared/projects';

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
 * `fd/<project-id>/i<n>` from the repository's own pattern, never hard-coded. Prototypes were once made on these
 * branches; they are no longer, and this is only for reading the ones that exist.
 */
export const branchFor = (descriptor: WorkspaceDescriptor, projectId: string, n: number): string =>
	descriptor.branchPattern.prototype.replace('<project-id>', projectId).replace('<n>', String(n));

/**
 * A project id becomes a directory and a branch name, so it is checked here
 * rather than trusted. Anything outside this set could escape either one.
 */
export const assertUsableProjectId = (projectId: string): void => {
	if (!PROJECT_ID.test(projectId)) {
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

/** The one `feature/<project-id>` branch for real-code work. */
export const codebaseBranchFor = (descriptor: WorkspaceDescriptor, projectId: string): string =>
	descriptor.branchPattern.codebase.replace('<project-id>', projectId);

/**
 * Starts codebase work on a project: its branch, and a record of it in the design repository that
 * reviewers can read. (A prototype has no branch: it is made by `recordPrototype`.)
 *
 * Codebase work is one branch per project, so if it already exists -- someone started it by hand,
 * which is how the first ones were made -- it is adopted rather than refused, and recorded.
 */
export const createIteration = async (
	productRoot: string,
	recordsRoot: string,
	descriptor: WorkspaceDescriptor,
	projectId: string,
	note: string,
	from: string,
): Promise<Iteration> => {
	const existing = readIterations(recordsRoot, projectId);
	const name = 'codebase';
	const branch = codebaseBranchFor(descriptor, projectId);
	if (existing.some((i) => i.name === name)) {
		throw new IterationProblem(`${projectId} already has codebase work recorded. Use Continue on it.`);
	}
	// Either way nothing is recorded unless the checkout succeeds, so the
	// record cannot claim work that is not there.
	if (await branchExists(productRoot, branch)) {
		await checkoutBranch(productRoot, branch);
	} else {
		await createBranch(productRoot, branch, from);
	}

	// Where it is on GitHub, so the project links to it for people without the repository.
	const origin = originOf(productRoot);
	const repository = origin === null ? null : gitHubRepoOf(origin);
	const iteration: Iteration = {
		projectId,
		name,
		branch,
		commit: null,
		createdAt: new Date().toISOString(),
		note,
		...(repository ? { repository } : {}),
	};
	writeIterations(recordsRoot, projectId, [...existing, iteration]);
	return iteration;
};

/**
 * Authors on the branch, with a GitHub login where one can be established
 * without guessing: a noreply address names its account, and the person running
 * this app is signed in as themselves, so their own commits (matched on the
 * git identity they commit under) carry their login. Everyone else stays a
 * name until they open an iteration of their own.
 */
export const peopleOn = async (productRoot: string, branch: string, signedInLogin: string | null): Promise<Person[]> => {
	const me = await localIdentity(productRoot);
	return (await branchAuthors(productRoot, branch)).map((a) => {
		const mine = signedInLogin !== null && isSamePerson(me, a);
		return { name: a.name, login: loginFromNoreply(a.email) ?? (mine ? signedInLogin : null) };
	});
};

/**
 * Saves where reviewers can open an iteration. Only the record changes; publishing it is the
 * caller's step, so a person who is signed out still keeps the address.
 */
export const recordPreview = (
	recordsRoot: string,
	projectId: string,
	name: string,
	previewUrl: string,
	/** The commit that was shared, so a reviewer's comment says what it was made against. */
	commit?: string,
	/** The pull request the preview was built from. */
	pullRequest?: string,
): Iteration => {
	const iterations = readIterations(recordsRoot, projectId);
	const found = iterations.find((i) => i.name === name);
	if (!found) throw new IterationProblem(`${projectId} has no iteration called ${name}.`);
	const updated = { ...found, previewUrl, ...(commit ? { commit } : {}), ...(pullRequest ? { pullRequest } : {}) };
	writeIterations(recordsRoot, projectId, iterations.map((i) => (i.name === name ? updated : i)));
	return updated;
};

/**
 * Work started outside the app (an agent in a terminal, or by hand) has a branch and no record. The branch is
 * the evidence, so the record is made from it rather than refusing the work: null only if the branch is not there.
 */
const adoptUnrecorded = async (
	productRoot: string,
	descriptor: WorkspaceDescriptor,
	projectId: string,
	name: string,
): Promise<Iteration | null> => {
	// Only an old-form name (`i3`) can be an older prototype branch (`fd/<id>/i3`). A versioned name is a page,
	// never a branch, so it is never read as one.
	const old = parsePrototypeName(name);
	const branch =
		name === 'codebase'
			? codebaseBranchFor(descriptor, projectId)
			: old?.legacy
				? branchFor(descriptor, projectId, old.iteration)
				: null;
	if (!branch || !(await branchExists(productRoot, branch))) return null;
	// Dated from the work itself, not from the moment the app first needed a record for it.
	const createdAt = (await branchStartedAt(productRoot, branch)) ?? new Date().toISOString();
	return { projectId, name, branch, commit: null, createdAt, note: 'Found in the repository; recorded when first opened here.' };
};

/**
 * An iteration's record, written now if the work has none. Everything that acts on an iteration (sharing it,
 * addressing its comments, saying which commit a comment was made against) goes through this, so work an agent
 * built in a terminal behaves exactly like work made in the app, whether or not the app ever switched branches for it.
 */
export const recordedIteration = async (
	productRoot: string,
	recordsRoot: string,
	descriptor: WorkspaceDescriptor,
	projectId: string,
	name: string,
): Promise<Iteration> => {
	const existing = readIterations(recordsRoot, projectId);
	const found = existing.find((i) => i.name === name);
	if (found) return found;
	const adopted = await adoptUnrecorded(productRoot, descriptor, projectId, name);
	if (!adopted) throw new IterationProblem(`${projectId} has no iteration called ${name}.`);
	writeIterations(recordsRoot, projectId, [...existing, adopted]);
	return adopted;
};

export const continueIteration = async (
	productRoot: string,
	recordsRoot: string,
	projectId: string,
	name: string,
	signedInLogin: string | null = null,
	descriptor?: WorkspaceDescriptor,
): Promise<Iteration> => {
	let iterations = readIterations(recordsRoot, projectId);
	let iteration = iterations.find((i) => i.name === name);
	if (!iteration && descriptor) {
		const adopted = await adoptUnrecorded(productRoot, descriptor, projectId, name);
		if (adopted) {
			iteration = adopted;
			iterations = [...iterations, adopted];
		}
	}
	if (!iteration) {
		throw new IterationProblem(`${projectId} has no iteration called ${name}.`);
	}
	await checkoutBranch(productRoot, iteration.branch);

	// Recorded on return, so the record tracks where the branch actually is
	// rather than where it started.
	const commit = await headCommit(productRoot);
	const contributors = await peopleOn(productRoot, iteration.branch, signedInLogin);
	const updated = iterations.map((i) => (i.name === name ? { ...i, commit, contributors } : i));
	writeIterations(recordsRoot, projectId, updated);
	return { ...iteration, commit, contributors };
};
