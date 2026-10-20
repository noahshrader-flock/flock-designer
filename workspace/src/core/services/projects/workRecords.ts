import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Work, Person } from '../../../shared/contract';
import type { WorkspaceDescriptor } from './descriptor';
import {
	branchAuthors,
	branchExists,
	branchStartedAt,
	checkoutBranch,
	createBranch,
	headCommit,
	isSamePerson,
	localIdentity,
	repositoryOf,
} from '../platform/git';
import { resolveInside } from '../platform/paths';
import { sharedCheckoutNote } from '../codebase/checkoutClean';
import { PROJECT_ID } from '../../../shared/validate';
import { parseWork, serializeWork, unreadableWork } from '../../../shared/workRecords';
import { writeAtomic } from '../platform/jsonFile';
import { loginFromNoreply } from '../../../shared/hostUrls';
import { WORK_FILE, workPath } from '../../../shared/designPaths';

/**
 * Records live in the design repository, never the product checkout: there, picking up work would need its branch first,
 * per-project state would need keeping off `develop`, and the dirty tree would block the next piece of work.
 */

/**
 * A project id becomes a directory and a branch name, so it is checked here
 * rather than trusted. Anything outside this set could escape either one.
 */
export const assertUsableProjectId = (projectId: string): void => {
	if (!PROJECT_ID.test(projectId)) {
		throw new Error(`"${projectId}" is not a usable project id. Use lower-case words separated by hyphens, like "users-inactivity-signal".`);
	}
};

export const recordPath = (recordsRoot: string, projectId: string): string => {
	assertUsableProjectId(projectId);
	return resolveInside(recordsRoot, join(projectId, WORK_FILE));
};

/** The records in a project's folder, as its file has them: none when there is no file, null when it cannot be read. */
export const workInFolder = (dir: string): Work[] | null => {
	const path = join(dir, WORK_FILE);
	return existsSync(path) ? parseWork(readFileSync(path, 'utf8')) : [];
};

/** Throws when its file cannot be read, unlike `workInFolder`. */
export const readWork = (recordsRoot: string, projectId: string): Work[] => {
	const records = workInFolder(dirname(recordPath(recordsRoot, projectId)));
	if (records === null) throw new Error(unreadableWork(workPath(projectId)));
	return records;
};

const writeWork = (recordsRoot: string, projectId: string, records: Work[]): void => {
	// Whole, so a reader never sees half a list, which it would refuse.
	writeAtomic(recordPath(recordsRoot, projectId), serializeWork(records));
};

export const codebaseBranchFor = (descriptor: WorkspaceDescriptor, projectId: string): string =>
	descriptor.branchPattern.codebase.replace('<project-id>', projectId);

/** One branch per project, so one already started by hand is adopted and recorded, not refused. */
export const createCodebaseWork = async (
	productRoot: string,
	recordsRoot: string,
	descriptor: WorkspaceDescriptor,
	projectId: string,
	note: string,
	from: string,
): Promise<Work> => {
	const existing = readWork(recordsRoot, projectId);
	const name = 'codebase';
	const branch = codebaseBranchFor(descriptor, projectId);
	if (existing.some((i) => i.name === name)) {
		throw new Error(`${projectId} already has codebase work recorded. Use Continue on it.`);
	}
	// Either way nothing is recorded unless the checkout succeeds, so the
	// record cannot claim work that is not there.
	const shared = await sharedCheckoutNote(productRoot);
	if (await branchExists(productRoot, branch)) {
		await checkoutBranch(productRoot, branch, shared);
	} else {
		await createBranch(productRoot, branch, from, shared);
	}

	// Where it is on GitHub, so the project links to it for people without the repository.
	const repository = await repositoryOf(productRoot);
	const record: Work = {
		projectId,
		name,
		branch,
		commit: null,
		createdAt: new Date().toISOString(),
		note,
		...(repository ? { repository } : {}),
	};
	writeWork(recordsRoot, projectId, [...existing, record]);
	return record;
};

/**
 * Authors on the branch, with a GitHub login only where it is not a guess: a noreply address names its account, and the
 * signed-in person's own commits (matched on their git identity) carry their login. Others stay a name until they open work.
 */
export const peopleOn = async (productRoot: string, branch: string, signedInLogin: string | null): Promise<Person[]> => {
	const me = await localIdentity(productRoot);
	return (await branchAuthors(productRoot, branch)).map((a) => {
		const mine = signedInLogin !== null && isSamePerson(me, a);
		return { name: a.name, login: loginFromNoreply(a.email) ?? (mine ? signedInLogin : null) };
	});
};

/**
 * Only the record changes; publishing it is the caller's step, so a person who is signed out still keeps the address.
 */
export const recordPreview = (
	recordsRoot: string,
	projectId: string,
	name: string,
	previewUrl: string,
	/** The commit that was shared, so a reviewer's comment says what it was made against. */
	commit?: string,
	pullRequest?: string,
): Work => {
	const records = readWork(recordsRoot, projectId);
	const found = records.find((i) => i.name === name);
	if (!found) throw new Error(`${projectId} has no ${name}.`);
	const updated = { ...found, previewUrl, ...(commit ? { commit } : {}), ...(pullRequest ? { pullRequest } : {}) };
	writeWork(
		recordsRoot,
		projectId,
		records.map((i) => (i.name === name ? updated : i)),
	);
	return updated;
};

/**
 * `readyAt` null means found not ready. Written only when it changes; publishing it is the caller's step.
 */
export const recordHandoff = (recordsRoot: string, projectId: string, readyAt: string | null): void => {
	const records = readWork(recordsRoot, projectId);
	const found = records.find((i) => i.name === 'codebase');
	if (!found || (found.readyAt ?? null) === readyAt) return;
	const { readyAt: _was, ...rest } = found;
	const updated = readyAt === null ? rest : { ...rest, readyAt };
	writeWork(
		recordsRoot,
		projectId,
		records.map((i) => (i === found ? updated : i)),
	);
};

/**
 * Work started outside the app has a branch and no record; the branch is the evidence, so the record is made from it
 * rather than refusing the work. Null only if the branch is not there.
 */
const adoptUnrecorded = async (productRoot: string, descriptor: WorkspaceDescriptor, projectId: string, name: string): Promise<Work | null> => {
	const branch = name === 'codebase' ? codebaseBranchFor(descriptor, projectId) : null;
	if (!branch || !(await branchExists(productRoot, branch))) return null;
	// Dated from the work itself, not from the moment the app first needed a record for it.
	const createdAt = (await branchStartedAt(productRoot, branch)) ?? new Date().toISOString();
	return { projectId, name, branch, commit: null, createdAt, note: 'Found in the repository; recorded when first opened here.' };
};

/**
 * Everything that acts on a record goes through this, so work an agent built in a terminal behaves exactly like work made
 * in the app.
 */
export const recordedWork = async (
	productRoot: string,
	recordsRoot: string,
	descriptor: WorkspaceDescriptor,
	projectId: string,
	name: string,
): Promise<Work> => {
	const existing = readWork(recordsRoot, projectId);
	const found = existing.find((i) => i.name === name);
	if (found) return found;
	const adopted = await adoptUnrecorded(productRoot, descriptor, projectId, name);
	if (!adopted) throw new Error(`${projectId} has no ${name}.`);
	writeWork(recordsRoot, projectId, [...existing, adopted]);
	return adopted;
};

export const continueWork = async (
	productRoot: string,
	recordsRoot: string,
	projectId: string,
	name: string,
	signedInLogin: string | null,
	descriptor: WorkspaceDescriptor,
): Promise<Work> => {
	let records = readWork(recordsRoot, projectId);
	let record = records.find((i) => i.name === name);
	if (!record) {
		const adopted = await adoptUnrecorded(productRoot, descriptor, projectId, name);
		if (adopted) {
			record = adopted;
			records = [...records, adopted];
		}
	}
	if (!record) {
		throw new Error(`${projectId} has no ${name}.`);
	}
	await checkoutBranch(productRoot, record.branch, await sharedCheckoutNote(productRoot));

	// Recorded on return, so the record tracks where the branch actually is
	// rather than where it started.
	const commit = await headCommit(productRoot);
	const contributors = await peopleOn(productRoot, record.branch, signedInLogin);
	const updated = records.map((i) => (i.name === name ? { ...i, commit, contributors } : i));
	writeWork(recordsRoot, projectId, updated);
	return { ...record, commit, contributors };
};
