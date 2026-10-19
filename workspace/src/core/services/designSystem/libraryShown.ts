/**
 * One choice asked by everything that reads the library, so no part shows two versions. While a hand-over branch is shown
 * nothing is saved (`refuse`): a Save would write that branch's files onto the library's branch.
 */
import type { ConnectedDesignSystem } from '../../../shared/contract';
import { type LibraryAt, baseAt } from './designLibrary';
import { branchTip } from '../platform/git';
import { HAND_OVER_BRANCH } from './handOverBranches';

export class LibraryShown {
	private readonly shown = new Map<string, { scope: string; branch: string }>();

	/** `changed` is told the branch shown (null: the library's own) whenever it changes, so every page reads the library again. */
	constructor(private readonly changed: (showing: string | null) => void) {}

	readonly at: LibraryAt = async (system) => {
		const chosen = this.shown.get(system.id);
		if (chosen === undefined) return baseAt(system);
		const tip = await branchTip(system.root, chosen.branch);
		if (tip !== null) return { commit: tip, showing: chosen.branch };
		// The branch was deleted since it was chosen.
		this.stop(system);
		return baseAt(system);
	};

	show(system: ConnectedDesignSystem, scope: string, branch: string): void {
		if (!HAND_OVER_BRANCH.test(branch)) throw new Error(`${branch} is not a branch DSNR named, so it is not shown.`);
		this.shown.set(system.id, { scope, branch });
		this.changed(branch);
	}

	stop(system: ConnectedDesignSystem): void {
		if (this.shown.delete(system.id)) this.changed(null);
	}

	scope(system: ConnectedDesignSystem): string | null {
		return this.shown.get(system.id)?.scope ?? null;
	}

	refuse(system: ConnectedDesignSystem | null, what: string): void {
		const chosen = system === null ? undefined : this.shown.get(system.id);
		if (chosen !== undefined && system !== null)
			throw new Error(`The previews show ${chosen.branch}, not ${system.branch}: show ${system.branch} again to ${what}.`);
	}
}
