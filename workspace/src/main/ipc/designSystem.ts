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
	const { MAX_VOICE, cloneAsPlanned, componentPictures, componentTokens, designSystems, library, previews, tokenBranches, voiceFile, warm } = d;

	handle('componentPictures', [], () => componentTokens.pictures());
	handle('designSystemCatalog', [arg.flag], async (refresh) => {
		const catalog = await library.catalog(refresh === true);
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
	handle('selectDesignSystem', [arg.name], (id) => (designSystems.select(String(id)), null));
	// Removed with everything the app keeps of it: its pictures too (P5).
	handle('removeDesignSystem', [arg.name], (id) => {
		designSystems.remove(String(id));
		componentPictures.forget(String(id));
		return null;
	});
	// Only a design system, refused by name before anything is downloaded; then connected like a folder that was located.
	// Connecting a design system (P4): cloned or used where it is, then looked in (`DesignLibrary.connect`).
	handle('connectDesignSystem', [arg.name], async (repository): Promise<DesignSystemConnection> => {
		const cloned = await cloneAsPlanned(String(repository), true);
		return library.connect(cloned.repository, cloned.path);
	});
	handle('chooseDesignSystem', [arg.name, arg.name], (repository, folder): DesignSystemConnection =>
		library.choose(String(repository), String(folder)),
	);
};
