import { CHANGE_KINDS, type ChangeKind, type SavedKind } from '../../shared/contract';
import { asRecord } from '../../shared/json';
import { isObjectId } from '../../shared/sha';
import { type Check, arg, handle } from '../handle';
import { tokenEditsOf } from '../services/designSystem/tokenEdits';
import { triedValuesOf } from '../services/designSystem/valueSources';
import { HAND_OVER } from '../services/designSystem/handOverBranches';
import type { DesignSystemArea } from '../areas/designSystem';

const name =
	(refused: string): Check<string> =>
	(v) => {
		if (typeof v !== 'string' || v.length === 0 || v.length > 500) throw new Error(refused);
		return v;
	};

const ds = {
	storyFile: name('A component is asked for by its story file.'),
	tokenPath: name('A token is asked for by its path.'),
	edits: tokenEditsOf as Check<ReturnType<typeof tokenEditsOf>>,
	tried: triedValuesOf as Check<ReturnType<typeof triedValuesOf>>,
	value: ((v) => triedValuesOf([v])[0]) as Check<ReturnType<typeof triedValuesOf>[number]>,
	kind: ((v) => {
		if (!CHANGE_KINDS.includes(v as ChangeKind)) throw new Error('That is not a kind of change DSNR keeps.');
		return v;
	}) as Check<ChangeKind>,
	/** A hand-over's commits are the agent's, not DSNR's to save. */
	savedKind: ((v) => {
		if (v === 'handOver' || !CHANGE_KINDS.includes(v as ChangeKind)) throw new Error('That is not a kind of change DSNR saves.');
		return v;
	}) as Check<SavedKind>,
	/** The tip the person looked at, and whether they sent a flagged one on purpose. */
	seen: ((v) => {
		const r = asRecord(v);
		if (!isObjectId(r.tip)) throw new Error('A branch is proposed at the commit that was shown.');
		return { tip: r.tip, confirmed: r.confirmed === true };
	}) as Check<{ tip: string; confirmed: boolean }>,
};

export const registerDesignSystem = (area: DesignSystemArea): void => {
	handle('componentPictures', [], area.componentPictures);
	// The window says only whether to wait for the update; where the design system is, it is never told and never asks.
	handle('designSystemCatalog', [arg.flag], area.designSystemCatalog);
	handle('storyPreview', [ds.edits], area.storyPreview);
	handle('componentTokens', [ds.storyFile], area.componentTokens);
	handle('componentVariants', [ds.storyFile], area.componentVariants);
	handle('tokenUsers', [ds.tokenPath], area.tokenUsers);
	handle('changeReach', [ds.edits], area.changeReach);
	handle('editedInCode', [], area.editedInCode);
	handle('editedReach', [], area.editedReach);
	handle('splitPreview', [], area.splitPreview);
	handle('checkSplit', [], area.checkSplit);
	handle('stopSplitCheck', [], area.stopSplitCheck);
	handle('valueSources', [ds.storyFile, ds.tried], area.valueSources);
	handle('handOverChanges', [arg.optional(ds.storyFile), HAND_OVER.check], area.handOverChanges);
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
