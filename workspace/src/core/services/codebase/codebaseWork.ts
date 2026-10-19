import type { Work } from '../../../shared/contract';
import { DESCRIPTOR_PATH, type WorkspaceDescriptor } from '../projects/descriptor';
import { branchExists, ensureLocalBranch, hasFileAt, readCheckout } from '../platform/git';
import { codebaseBranchFor, continueWork, createCodebaseWork } from '../projects/workRecords';

export interface WorkCheckout {
	readonly canonical: string;
	readonly descriptor: WorkspaceDescriptor;
	readonly recordsRoot: string;
}

export const codebaseWork = ({
	records,
	login,
	written,
}: {
	records: (projectId: string) => Promise<Work[]>;
	login: () => string | null;
	written: (work: Work) => Work;
}) => {
	/** Started when the branch is here or the work is recorded; Build then continues it rather than starting a second. */
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

	const hasSetup = (canonical: string, branch: string): Promise<boolean> => hasFileAt(canonical, `refs/heads/${branch}`, DESCRIPTOR_PATH);

	const start = async (at: WorkCheckout, projectId: string, note: string, from?: string): Promise<Work> => {
		const { canonical } = at;
		// Only ever a branch that exists here or on GitHub, so the window cannot pass git an option or a revision
		// expression. One only on GitHub (as most are in a fresh clone) is made local, with nothing checked out.
		if (from !== undefined) await ensureLocalBranch(canonical, from);
		const branch = from ?? (await readCheckout(canonical)).branch;
		if (branch === null) throw new Error('This repository has a detached HEAD. Check out a branch first.');
		// Work is built where the product's DSNR setup is. A branch without it (develop, before the
		// setup is merged there) would leave the checkout on a branch DSNR cannot work in.
		if (!(await hasSetup(canonical, branch))) {
			throw new Error(`${branch} has no ${DESCRIPTOR_PATH}, so work cannot start from it. Start from a branch that has the DSNR setup.`);
		}
		return written(await createCodebaseWork(canonical, at.recordsRoot, at.descriptor, projectId, note, branch));
	};

	/**
	 * A checkout already on the branch is left exactly as it is, uncommitted work and all, since that is the work in
	 * progress; moving from another branch needs a clean one, so nothing is carried or lost.
	 */
	const resume = async (at: WorkCheckout, projectId: string, branch: string): Promise<void> => {
		const { canonical } = at;
		await ensureLocalBranch(canonical, branch);
		if ((await readCheckout(canonical)).branch === branch) return;
		// Before the checkout moves, not after: a branch without the setup would leave it somewhere DSNR cannot work.
		if (!(await hasSetup(canonical, branch))) {
			throw new Error(`${branch} has no ${DESCRIPTOR_PATH}, so DSNR cannot work in it. Merge a branch that has the DSNR setup into it first.`);
		}
		await continueWork(canonical, at.recordsRoot, projectId, 'codebase', login(), at.descriptor);
	};

	return { of, start, resume };
};
