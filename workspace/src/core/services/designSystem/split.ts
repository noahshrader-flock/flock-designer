/** The split of what the person has edited, previewed and checked: nothing here writes to any repository. */
import { basename } from 'node:path';
import type { ConnectedDesignSystem, SplitPreview } from '../../../shared/contract';
import { storyComponent } from '../../../shared/valueNames';
import { libraryCommit } from './designLibrary';
import { changesOnTip, editedInCode, editedLines } from './editedInCode';
import { type SplitProof, splitKey } from './splitProof';
import { splitUnits } from './splitUnits';

/** On the commit the tab draws, keyed by it and by every unit's files as they are now. */
const splitNow = async (system: ConnectedDesignSystem) => {
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
	return { state: 'ready', tip: now.tip, units, stays, check: proof.current(now.key) };
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
	const named = split.units.map((u) => (u.file === null ? basename(u.files[0]!.path) : storyComponent(u.file)));
	proof.start(key, system, tip, files, (i) => named[i]!);
};
