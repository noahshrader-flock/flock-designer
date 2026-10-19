/**
 * Which commit of the library the Design System tab shows: its branch on GitHub, or the tip of a branch handed to Claude
 * Code. One choice asked by everything that reads the library, so no part shows two versions; kept in memory only. While a
 * branch is shown nothing is saved (`refuse`): a Save would write the branch's files onto the library's branch.
 */
import type { ConnectedDesignSystem } from '../../../shared/contract';
import { type LibraryAt, baseAt } from './designLibrary';
import { branchTip } from '../platform/git';
import { HAND_OVER_BRANCH } from './handOverBranches';

export class LibraryShown {
	/** The hand-over branch shown, by the design system's id, and the unit it was handed over for. */
	private readonly shown = new Map<string, { scope: string; branch: string }>();

	/** `changed` is told the branch shown (null: the library's own) whenever it changes, so every page reads the library again. */
	constructor(private readonly changed: (showing: string | null) => void) {}

	/** What the tab reads: the shown branch's tip, or the library's own branch when none is shown or the branch is gone. */
	readonly at: LibraryAt = async (system) => {
		const chosen = this.shown.get(system.id);
		if (chosen === undefined) return baseAt(system);
		const tip = await branchTip(system.root, chosen.branch);
		if (tip !== null) return { commit: tip, showing: chosen.branch };
		// Deleted since it was chosen: the library's own branch again, said to every page.
		this.stop(system);
		return baseAt(system);
	};

	/** Shows `branch`, the one DSNR named for the unit `scope`. */
	show(system: ConnectedDesignSystem, scope: string, branch: string): void {
		if (!HAND_OVER_BRANCH.test(branch)) throw new Error(`${branch} is not a branch DSNR named, so it is not shown.`);
		this.shown.set(system.id, { scope, branch });
		this.changed(branch);
	}

	/** Shows the library's own branch again. */
	stop(system: ConnectedDesignSystem): void {
		if (this.shown.delete(system.id)) this.changed(null);
	}

	/** The unit whose branch is shown, or null. */
	scope(system: ConnectedDesignSystem): string | null {
		return this.shown.get(system.id)?.scope ?? null;
	}

	/** Refuses `what` while a branch is shown, in words, with what to do. */
	refuse(system: ConnectedDesignSystem | null, what: string): void {
		const chosen = system === null ? undefined : this.shown.get(system.id);
		if (chosen !== undefined && system !== null)
			throw new Error(`The previews show ${chosen.branch}, not ${system.branch}: show ${system.branch} again to ${what}.`);
	}
}
