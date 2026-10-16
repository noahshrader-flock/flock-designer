import { isObjectId } from '../../shared/sha';
import { arg, handle } from '../handle';
import { tokenEditsOf } from '../services/tokenEdits';
import { triedValuesOf } from '../services/valueSources';

/** A story file the window names a component by, or an error: a path, never anything else. */
const storyFileOf = (file: unknown): string => {
	if (typeof file !== 'string' || file.length === 0 || file.length > 500) throw new Error('A component is asked for by its story file.');
	return file;
};
import type { IpcDeps } from '../ipc';

/**
 * The Design System tab: the design systems connected, their components and tokens, a change to the tokens or to the
 * voice and tone, and its branch.
 */
export const registerDesignSystem = (d: IpcDeps): void => {
	const { componentTokens, designSystems, library, previews, tokenBranches, valueBranches, valueSources, voiceFile, warm } = d;

	// The longest a save takes: far beyond any real voice and tone, short of anything that could hurt.
	const MAX_VOICE = 200_000;

	handle('componentPictures', [], () => componentTokens.pictures());
	// The window says only whether to wait for the update; where the design system is, it is never told and never asks.
	handle('designSystemCatalog', [arg.flag], async (refresh) => {
		const catalog = await library.catalog(refresh);
		if (catalog.state === 'ready') warm();
		return catalog;
	});
	// A change is only ever a list of token edits, checked here and again before anything is written (T3, T4).
	handle('storyPreview', [arg.unknown], (edits) => previews.preview(tokenEditsOf(edits)));
	// The window names a story file, and only a story file of the library is answered.
	handle('componentTokens', [arg.unknown], (file) => componentTokens.of(storyFileOf(file)));
	// What a change reaches is asked for by the change, checked as a change always is.
	handle('changeReach', [arg.unknown], (edits) => componentTokens.reach(tokenEditsOf(edits)));
	// Values tried on a component's instances, by its story file: checked as the contract says one is, and written only as
	// the number or colour each reads as, where it was found (Phase 4).
	handle('valueSources', [arg.unknown, arg.unknown], (file, tried) => valueSources.of(storyFileOf(file), triedValuesOf(tried)));
	handle('valueBranch', [arg.unknown], (file) => valueBranches.current(storyFileOf(file)));
	handle('saveValues', [arg.unknown, arg.unknown], (file, tried) => valueBranches.save(triedValuesOf(tried), storyFileOf(file)));
	handle('proposeValues', [arg.unknown], (file) => valueBranches.propose(storyFileOf(file)));
	handle('forgetValueBranch', [arg.unknown], (file) => (valueBranches.forget(storyFileOf(file)), null));
	handle('tokenBranch', [], () => tokenBranches.current());
	handle('saveTokens', [arg.unknown], (edits) => tokenBranches.save(tokenEditsOf(edits)));
	handle('proposeTokens', [], () => tokenBranches.propose());
	handle('forgetTokenBranch', [], () => (tokenBranches.forget(), null));
	handle('voiceAndTone', [], () => voiceFile().current());
	handle('saveVoiceAndTone', [arg.unknown, arg.unknown], (text, against) => {
		if (typeof text !== 'string' || text.length > MAX_VOICE) throw new Error('The voice and tone is saved as text, up to 200,000 characters.');
		// A blob's sha: 40 hex, or 64 in a repository on SHA-256.
		if (against !== null && !isObjectId(against)) throw new Error('A save is made against the file’s sha.');
		return voiceFile().save(text, against);
	});
	handle('proposeVoiceAndTone', [], () => voiceFile().propose());
	handle('forgetVoiceBranch', [], () => (voiceFile().forget(), null));
	handle('designSystems', [], () => designSystems.read());
};
