import { CHANGE_KINDS, type ChangeKind, type SavedKind } from '../../shared/contract';
import { asRecord } from '../../shared/json';
import { isObjectId } from '../../shared/sha';
import { type Check, arg, handle } from '../handle';
import { tokenEditsOf } from '../services/designSystem/tokenEdits';
import { triedValuesOf } from '../services/designSystem/valueSources';
import { HAND_OVER } from '../services/designSystem/handOverBranches';
import type { DesignSystemArea } from '../areas/designSystem';

/** A name the window asks for something by: a short string, never anything else, or `refused` is said. */
const name =
	(refused: string): Check<string> =>
	(v) => {
		if (typeof v !== 'string' || v.length === 0 || v.length > 500) throw new Error(refused);
		return v;
	};

/**
 * What the Design System tab's calls take, each checked before its handler sees it (`handle`), as every argument is: a
 * component by its story file; a change as the contract says one is (token edits, values tried); a kind of change.
 */
const ds = {
	/** A story file the window names a component by: a path, never anything else. */
	storyFile: name('A component is asked for by its story file.'),
	/** A token, by its path. */
	tokenPath: name('A token is asked for by its path.'),
	edits: tokenEditsOf as Check<ReturnType<typeof tokenEditsOf>>,
	tried: triedValuesOf as Check<ReturnType<typeof triedValuesOf>>,
	/** One value tried, checked as one of a list is. */
	value: ((v) => triedValuesOf([v])[0]) as Check<ReturnType<typeof triedValuesOf>[number]>,
	/** A kind of change kept on a branch (`ChangeKinds`), by its name. */
	kind: ((v) => {
		if (!CHANGE_KINDS.includes(v as ChangeKind)) throw new Error('That is not a kind of change DSNR keeps.');
		return v;
	}) as Check<ChangeKind>,
	/** A kind DSNR saves itself: a hand-over's commits are Claude Code's. */
	savedKind: ((v) => {
		if (v === 'handOver' || !CHANGE_KINDS.includes(v as ChangeKind)) throw new Error('That is not a kind of change DSNR saves.');
		return v;
	}) as Check<SavedKind>,
	/** What a hand-over is proposed at: the tip the person looked at, by its sha, and whether they sent a flagged one on purpose. */
	seen: ((v) => {
		const r = asRecord(v);
		if (!isObjectId(r.tip)) throw new Error('A branch is proposed at the commit that was shown.');
		return { tip: r.tip, confirmed: r.confirmed === true };
	}) as Check<{ tip: string; confirmed: boolean }>,
};

/**
 * The Design System tab: the design systems connected, their components and tokens, a change to the tokens or to the
 * voice and tone, and its branch.
 */
export const registerDesignSystem = (area: DesignSystemArea): void => {
	handle('componentPictures', [], area.componentPictures);
	// The window says only whether to wait for the update; where the design system is, it is never told and never asks.
	handle('designSystemCatalog', [arg.flag], area.designSystemCatalog);
	// A change is only ever a list of token edits.
	handle('storyPreview', [ds.edits], area.storyPreview);
	// The window names a story file, and only a story file of the library is answered.
	handle('componentTokens', [ds.storyFile], area.componentTokens);
	handle('componentVariants', [ds.storyFile], area.componentVariants);
	handle('tokenUsers', [ds.tokenPath], area.tokenUsers);
	// What a change reaches is asked for by the change, checked as a change always is.
	handle('changeReach', [ds.edits], area.changeReach);
	// Values tried on a component's instances, by its story file, checked as the contract says one is.
	handle('valueSources', [ds.storyFile, ds.tried], area.valueSources);
	// Process changes: a unit by its story file, or the tokens (none); what it hands over checked as a change always is.
	handle('handOverChanges', [arg.optional(ds.storyFile), HAND_OVER.check], area.handOverChanges);
	// A change's branch by its kind and scope (a story file, or none); the change a save takes is checked as its kind's.
	handle('changeBranch', [ds.kind, arg.optional(ds.storyFile)], area.changeBranch);
	handle('changeScopes', [ds.kind], area.changeScopes);
	handle('saveChange', [ds.savedKind, arg.optional(ds.storyFile), arg.unknown], area.saveChange);
	handle('proposeChange', [ds.kind, arg.optional(ds.storyFile), arg.optional(ds.seen)], area.proposeChange);
	handle('forgetChange', [ds.kind, arg.optional(ds.storyFile)], area.forgetChange);
	handle('showHandOver', [arg.optional(ds.storyFile)], area.showHandOver);
	handle('showLibraryBranch', [], area.showLibraryBranch);
	handle('writeValue', [ds.storyFile, ds.value], area.writeValue);
	handle('voiceAndTone', [], area.voiceAndTone);
	handle('designSystems', [], area.designSystems);
};
