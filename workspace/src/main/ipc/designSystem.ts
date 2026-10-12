import type { DesignSystemConnection } from '../../shared/contract';
import { isObjectId } from '../../shared/sha';
import { arg, handle } from '../handle';
import { tokenEditsOf } from '../services/tokenEdits';
import type { IpcDeps } from '../ipc';

/**
 * The Design System tab: the design systems connected, their components and tokens, a change to the tokens or to the
 * voice and tone, and its branch.
 */
export const registerDesignSystem = (d: IpcDeps): void => {
	const { cloneAsPlanned, componentPictures, componentTokens, designSystems, library, previews, tokenBranches, voiceFile, warm } = d;

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
	handle('componentTokens', [arg.unknown], (file) => {
		if (typeof file !== 'string' || file.length === 0 || file.length > 500) throw new Error('A component is asked for by its story file.');
		return componentTokens.of(file);
	});
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
	handle('selectDesignSystem', [arg.name], (id) => (designSystems.select(id), null));
	// Removed with everything the app keeps of it: its pictures too (P5).
	handle('removeDesignSystem', [arg.name], (id) => {
		designSystems.remove(id);
		componentPictures.forget(id);
		return null;
	});
	// Connecting a design system (P4): only a design system, refused by name before anything is downloaded, then cloned or
	// used where it is and looked in like a folder that was located (`DesignLibrary.connect`).
	handle('connectDesignSystem', [arg.name], async (repository): Promise<DesignSystemConnection> => {
		const cloned = await cloneAsPlanned(repository, true);
		return library.connect(cloned.repository, cloned.path);
	});
	handle('chooseDesignSystem', [arg.name, arg.name], (repository, folder): DesignSystemConnection => library.choose(repository, folder));
};
