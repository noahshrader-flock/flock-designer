/**
 * Which commit of the library the Design System tab shows (PROCESS_CHANGES_PLAN Phase 2): its branch on GitHub, as it always
 * has, or the tip of a branch handed to Claude Code (Preview this branch), so what Claude Code committed is seen in the
 * stories. One choice for the design system shown, asked by everything that reads the library for the tab (the catalog, the
 * previews, the component index), so no part of it shows two versions. Only committed work is read, through git's objects,
 * never the folder. Kept in memory only: a restart shows the library's branch again.
 *
 * While a branch is shown, nothing is saved or handed over (`refuse`): a value's Save writes the files the index drew, which
 * would be the branch's, onto the library's branch.
 */
import type { ConnectedDesignSystem } from '../../shared/contract';
import { type LibraryAt, baseAt } from './designLibrary';
import { branchTip } from './git';
import { HANDOFF_BRANCH } from './handoffBranches';

export class LibraryShown {
	/** The hand-off branch shown, by the design system's id, and the unit it was handed over for. */
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
		if (!HANDOFF_BRANCH.test(branch)) throw new Error(`${branch} is not a branch DSNR named, so it is not shown.`);
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
