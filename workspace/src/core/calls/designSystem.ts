import type { HandedChange } from '../../shared/contract';
import { asRecord } from '../../shared/json';
import { isObjectId } from '../../shared/sha';
import { type Check, arg, handle } from '../handle';
import { tokenEditsOf } from '../services/designSystem/tokenEdits';
import { triedValuesOf } from '../services/designSystem/valueSources';
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
 * component by its story file; a change as the contract says one is (token edits, values tried); words; the voice and tone.
 */
const ds = {
	/** A story file the window names a component by: a path, never anything else. */
	storyFile: name('A component is asked for by its story file.'),
	/** A token, by its path. */
	tokenPath: name('A token is asked for by its path.'),
	edits: tokenEditsOf as Check<ReturnType<typeof tokenEditsOf>>,
	tried: triedValuesOf as Check<ReturnType<typeof triedValuesOf>>,
	/** What one unit hands to Claude Code: its token edits, or a component's values tried, each checked as those always are. */
	handed: ((v) => {
		const r = asRecord(v);
		const keys = Object.keys(r);
		if (keys.length === 1 && keys[0] === 'edits') return { edits: tokenEditsOf(r.edits) };
		if (keys.length === 1 && keys[0] === 'tried') return { tried: triedValuesOf(r.tried) };
		throw new Error('A hand-over is the token edits being tried, or a component’s values tried.');
	}) as Check<HandedChange>,
	/** One value tried, checked as one of a list is. */
	value: ((v) => triedValuesOf([v])[0]) as Check<ReturnType<typeof triedValuesOf>[number]>,
	/** The voice and tone as it is saved: text, far beyond any real one and short of anything that could hurt. */
	voice: ((text) => {
		if (typeof text !== 'string' || text.length > 200_000) throw new Error('The voice and tone is saved as text, up to 200,000 characters.');
		return text;
	}) as Check<string>,
	/** A commit, by its sha: the hand-over branch's tip the person looked at. */
	commit: ((v) => {
		if (!isObjectId(v)) throw new Error('A branch is proposed at the commit that was shown.');
		return v;
	}) as Check<string>,
	/** The blob a save is made against: its sha (40 hex, or 64 in a repository on SHA-256), or none for a new file. */
	against: ((v) => {
		if (v !== null && !isObjectId(v)) throw new Error('A save is made against the file’s sha.');
		return v;
	}) as Check<string | null>,
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
	handle('valueBranch', [ds.storyFile], area.valueBranch);
	handle('valueBranchFiles', [], area.valueBranchFiles);
	// Process changes: a unit by its story file, or the tokens (none); what it hands over checked as a change always is.
	handle('handOverChanges', [arg.optional(ds.storyFile), ds.handed], area.handOverChanges);
	handle('handoffBranch', [arg.optional(ds.storyFile)], area.handoffBranch);
	handle('handoffFiles', [], area.handoffFiles);
	handle('proposeHandoff', [arg.optional(ds.storyFile), ds.commit, arg.flag], area.proposeHandoff);
	handle('forgetHandoff', [arg.optional(ds.storyFile)], area.forgetHandoff);
	handle('showHandoff', [arg.optional(ds.storyFile)], area.showHandoff);
	handle('showLibraryBranch', [], area.showLibraryBranch);
	handle('writeValue', [ds.storyFile, ds.value], area.writeValue);
	handle('saveValues', [ds.storyFile, ds.tried], area.saveValues);
	handle('proposeValues', [ds.storyFile], area.proposeValues);
	handle('forgetValueBranch', [ds.storyFile], area.forgetValueBranch);
	handle('tokenBranch', [], area.tokenBranch);
	handle('saveTokens', [ds.edits], area.saveTokens);
	handle('proposeTokens', [], area.proposeTokens);
	handle('forgetTokenBranch', [], area.forgetTokenBranch);
	handle('voiceAndTone', [], area.voiceAndTone);
	handle('saveVoiceAndTone', [ds.voice, ds.against], area.saveVoiceAndTone);
	handle('proposeVoiceAndTone', [], area.proposeVoiceAndTone);
	handle('forgetVoiceBranch', [], area.forgetVoiceBranch);
	handle('designSystems', [], area.designSystems);
};
