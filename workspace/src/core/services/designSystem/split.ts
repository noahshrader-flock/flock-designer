/** The split of what the person has edited: previewed and checked, writing to no repository, then proposed. */
import type { ConnectedDesignSystem, SplitPreview, SplitProposal } from '../../../shared/contract';
import { saidEdit, unitName } from '../../../shared/valueNames';
import { libraryCommit } from './designLibrary';
import { changesOnTip, editedInCode, editedLines } from './editedInCode';
import { type SplitProof, splitKey } from './splitProof';
import type { PartToMake, SplitBranches } from './splitBranches';
import { git } from '../platform/git';
import { splitUnits } from './splitUnits';

/** On the commit the tab draws, keyed by it and by every unit's files as they are now. */
export const splitNow = async (system: ConnectedDesignSystem) => {
	const [edited, tip] = await Promise.all([editedInCode(system), libraryCommit(system.root, system.branch)]);
	if (edited.state !== 'ready' || tip === null) return null;
	const split = splitUnits(edited, await editedLines(system, edited));
	return { edited, tip, split, key: await splitKey(system, tip, 'units' in split ? split.units : []) };
};

export const splitPreview = async (proof: SplitProof, system: ConnectedDesignSystem): Promise<SplitPreview> => {
	const now = await splitNow(system);
	if (now === null) return { state: 'none' };
	if ('notSplit' in now.split) return { state: 'not-split', parts: now.split.notSplit };
	const { units, stays } = now.split;
	return { state: 'ready', tip: now.tip, seen: now.key, units, stays, check: proof.current(now.key) };
};

/** Started in the background; a file that will not merge onto the tip is said at once, with nothing checked. */
export const checkSplit = async (proof: SplitProof, system: ConnectedDesignSystem): Promise<void> => {
	const now = await splitNow(system);
	if (now === null || 'notSplit' in now.split) throw new Error('There is nothing edited to split.');
	const { edited, tip, split, key } = now;
	const files = [];
	for (const u of split.units) {
		const on = await changesOnTip(system, edited, tip, u.files);
		if ('not' in on) return proof.said(key, { state: 'fails', why: on.not });
		files.push(on.files);
	}
	proof.start(key, system, tip, files, (i) => unitName(split.units[i]!));
};

/**
 * Proposes the split the person checked (`seen`), in the order the check found; one edited since is refused, as is one not
 * checked, and one not shown to build or past one sitting's review unless `confirmed`. Proposing it again goes on opening it.
 */
export const proposeSplit = async (
	proof: SplitProof,
	branches: SplitBranches,
	system: ConnectedDesignSystem,
	seen: string,
	confirmed: boolean,
): Promise<SplitProposal> => {
	if (branches.proposed() === seen) return branches.open();
	const now = await splitNow(system);
	if (now === null || 'notSplit' in now.split) throw new Error('There is nothing edited to split.');
	if (now.key !== seen) throw new Error('Your edits have changed since they were checked: check them again, then propose them.');
	const check = proof.current(now.key);
	if (check.state !== 'built' && check.state !== 'unproven') throw new Error('Check that they build first; then they can be proposed.');
	const { units } = now.split;
	if ((check.state === 'unproven' || units.some((u) => u.large)) && !confirmed)
		throw new Error('These are not shown to build, or one is more than one sitting’s review: propose them anyway, on purpose.');
	const stacks = check.state === 'built' ? check.stacks : units.map((_, unit) => ({ unit, on: null }));
	const at = new Map(stacks.map((s, i) => [s.unit, i]));
	const from = await git(system.root, ['rev-parse', '--abbrev-ref', 'HEAD']);
	const parts: PartToMake[] = [];
	for (const { unit, on } of stacks) {
		const u = units[unit]!;
		const files = await changesOnTip(system, now.edited, now.tip, u.files);
		if ('not' in files) throw new Error(`${files.not} Nothing was made.`);
		const name = unitName(u);
		parts.push({
			name,
			on: on === null ? null : at.get(on)!,
			files: files.files,
			title: `${name}: from ${from}`,
			body: [
				`${name}, split from \`${from}\` by DSNR: this has this one ${u.file === null ? 'file' : 'component'}’s change, and nothing else of that branch.`,
				'',
				on === null
					? `Onto \`${system.branch}\`.`
					: `Onto ${unitName(units[on]!)}’s pull request: it does not build without it, so merge that first.`,
				'',
				...u.files.map((f) => `- \`${f.path}\`: ${saidEdit(f)}`),
				'',
				check.state === 'built' ? `Checked: it builds on what it stands on, by ${check.by}, with no new error.` : `Not checked: ${check.why}`,
				'',
				'_Opened by DSNR as a draft._',
			].join('\n'),
		});
	}
	return branches.make(seen, now.tip, parts);
};
