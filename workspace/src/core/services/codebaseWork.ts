import { basename } from 'node:path';
import type { Work } from '../../shared/contract';
import { DESCRIPTOR_PATH, type WorkspaceDescriptor } from './descriptor';
import { branchExists, ensureLocalBranch, hasFileAt, readCheckout } from './git';
import { codebaseBranchFor, continueWork, createCodebaseWork } from './workRecords';

/** A checkout the person opened, as a handler has it: its folder, its descriptor, and the records beside it. */
export interface WorkCheckout {
	readonly canonical: string;
	readonly descriptor: WorkspaceDescriptor;
	readonly recordsRoot: string;
}

/**
 * A project's codebase work in a product checkout: whether it is started, starting it, and picking it up again. The
 * branch is never changed under a running agent.
 */
export const codebaseWork = ({
	agentIn,
	records,
	login,
	written,
}: {
	/** Whether the agent is running in this folder. */
	agentIn: (canonical: string) => boolean;
	records: (projectId: string) => Promise<Work[]>;
	/** Who is signed in to GitHub, whose work this is. */
	login: () => string | null;
	/** Called with what was recorded, to publish it. */
	written: (work: Work) => Work;
}) => {
	const assertAgentNotHere = (canonical: string): void => {
		if (agentIn(canonical)) {
			throw new Error(
				`The agent is working in ${basename(canonical)}, and this would change its branch. Wait for it to finish, or take it over, then try again.`,
			);
		}
	};

	/**
	 * A project's codebase work as this checkout and the records know it: its branch, whether that branch is here, and
	 * whether it is recorded. Started when either is true; Build then continues it rather than starting a second.
	 */
	const of = async ({ canonical, descriptor }: WorkCheckout, projectId: string) => {
		const branch = codebaseBranchFor(descriptor, projectId);
		const known = await records(projectId);
		const exists = await branchExists(canonical, branch);
		const recorded = known.some((i) => i.name === 'codebase');
		// A branch that is here but has no DSNR setup cannot be worked in: moving the checkout to it would leave DSNR
		// unable to read what it may run. One not made yet is made from a branch that has it (`start` checks).
		const setup = !exists || (await hasSetup(canonical, branch));
		return { branch, exists, recorded, started: exists || recorded, setup, records: known };
	};

	/** Whether a branch here carries the product's DSNR setup, which is what says what DSNR may run in it. */
	const hasSetup = (canonical: string, branch: string): Promise<boolean> => hasFileAt(canonical, `refs/heads/${branch}`, DESCRIPTOR_PATH);

	/**
	 * Codebase work's branch, checked out, and its record: from `from`, or the branch the checkout is on. Only Build
	 * starts codebase work from the app, so there is no channel for it of its own.
	 */
	const start = async (at: WorkCheckout, projectId: string, note: string, from?: string): Promise<Work> => {
		const { canonical } = at;
		assertAgentNotHere(canonical);
		// Only ever a branch that exists here or on GitHub, so the window cannot pass git an option or a revision
		// expression. One only on GitHub (as most are in a fresh clone) is made local, with nothing checked out.
		if (from !== undefined) await ensureLocalBranch(canonical, from);
		const branch = from ?? (await readCheckout(canonical)).branch;
		if (branch === null) throw new Error('This repository has a detached HEAD. Check out a branch first.');
		// Work is built where the product's DSNR setup is. A branch without it (develop, before the
		// setup is merged there) would leave the checkout on a branch this app can no longer work in.
		if (!(await hasSetup(canonical, branch))) {
			throw new Error(`${branch} has no ${DESCRIPTOR_PATH}, so work cannot start from it. Start from a branch that has the DSNR setup.`);
		}
		return written(await createCodebaseWork(canonical, at.recordsRoot, at.descriptor, projectId, note, branch));
	};

	/**
	 * Codebase work already started, picked up: its branch made local if it is only on GitHub, and the checkout moved to
	 * it. A checkout already on it is left exactly as it is, uncommitted work and all, since that is the work in
	 * progress; moving from another branch needs a clean one, so nothing is carried or lost.
	 */
	const resume = async (at: WorkCheckout, projectId: string, branch: string): Promise<void> => {
		const { canonical } = at;
		assertAgentNotHere(canonical);
		await ensureLocalBranch(canonical, branch);
		if ((await readCheckout(canonical)).branch === branch) return;
		// Before the checkout moves, not after: a branch without the setup would leave it somewhere DSNR cannot work.
		if (!(await hasSetup(canonical, branch))) {
			throw new Error(`${branch} has no ${DESCRIPTOR_PATH}, so DSNR cannot work in it. Merge a branch that has the DSNR setup into it first.`);
		}
		await continueWork(canonical, at.recordsRoot, projectId, 'codebase', login(), at.descriptor);
	};

	return { assertAgentNotHere, of, start, resume };
};
