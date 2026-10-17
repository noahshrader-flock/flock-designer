import type { HandedChange } from '../../shared/contract';
import { asRecord } from '../../shared/json';
import { isObjectId } from '../../shared/sha';
import { type Check, arg, handle } from '../handle';
import { handToClaude } from '../services/editor';
import { tokenEditsOf } from '../services/tokenEdits';
import { triedValuesOf } from '../services/valueSources';
import type { IpcDeps } from '../ipc';

/**
 * What the Design System tab's calls take, each checked before its handler sees it (`handle`), as every argument is: a
 * component by its story file; a change as the contract says one is (token edits, values tried); words; the voice and tone.
 */
const ds = {
	/** A story file the window names a component by: a path, never anything else. */
	storyFile: ((file) => {
		if (typeof file !== 'string' || file.length === 0 || file.length > 500) throw new Error('A component is asked for by its story file.');
		return file;
	}) as Check<string>,
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
export const registerDesignSystem = (d: IpcDeps): void => {
	const {
		componentTokens,
		componentVariants,
		designSystems,
		library,
		previews,
		tokenBranches,
		valueAgent,
		valueBranches,
		handoffBranches,
		ports,
		valueSources,
		voiceFile,
		warm,
	} = d;

	handle('componentPictures', [], () => componentTokens.pictures());
	// The window says only whether to wait for the update; where the design system is, it is never told and never asks.
	handle('designSystemCatalog', [arg.flag], async (refresh) => {
		const catalog = await library.catalog(refresh);
		if (catalog.state === 'ready') warm();
		return catalog;
	});
	// A change is only ever a list of token edits, checked here and again before anything is written (T3, T4).
	handle('storyPreview', [ds.edits], (edits) => previews.preview(edits));
	// The window names a story file, and only a story file of the library is answered.
	handle('componentTokens', [ds.storyFile], (file) => componentTokens.of(file));
	handle('componentVariants', [ds.storyFile], (file) => componentVariants.of(file));
	// What a change reaches is asked for by the change, checked as a change always is.
	handle('changeReach', [ds.edits], (edits) => componentTokens.reach(edits));
	// Values tried on a component's instances, by its story file: checked as the contract says one is, and written only as
	// the number or colour each reads as, where it was found (Phase 4).
	handle('valueSources', [ds.storyFile, ds.tried], (file, tried) => valueSources.of(file, tried));
	handle('valueBranch', [ds.storyFile], (file) => valueBranches.current(file));
	handle('valueBranchFiles', [], () => valueBranches.scopes());
	// Process changes: a unit by its story file, or the tokens (none); what it hands over checked as a change always is, and
	// handed to Claude Code as every hand-over is, in the library's root, with the prompt typed in.
	handle('handOverChanges', [arg.optional(ds.storyFile), ds.handed], async (file, change) => {
		const { root, branch, prompt } = await handoffBranches.start(file ?? '', change);
		return { branch, ...(await handToClaude(ports, root, prompt)) };
	});
	handle('handoffBranch', [arg.optional(ds.storyFile)], (file) => handoffBranches.current(file ?? ''));
	handle('handoffFiles', [], () => handoffBranches.scopes());
	handle('proposeHandoff', [arg.optional(ds.storyFile), arg.flag], (file, confirmed) => handoffBranches.propose(file ?? '', confirmed));
	handle('forgetHandoff', [arg.optional(ds.storyFile)], (file) => (handoffBranches.forget(file ?? ''), null));
	// Only on the person's press: it runs the agent, in a copy of the library.
	handle('writeValue', [ds.storyFile, ds.value], async (file, value) => {
		await valueAgent.write(file, value);
		return null;
	});
	handle('saveValues', [ds.storyFile, ds.tried], (file, tried) => valueBranches.save(tried, file));
	handle('proposeValues', [ds.storyFile], (file) => valueBranches.propose(file));
	handle('forgetValueBranch', [ds.storyFile], (file) => (valueBranches.forget(file), null));
	handle('tokenBranch', [], () => tokenBranches.current());
	handle('saveTokens', [ds.edits], (edits) => tokenBranches.save(edits));
	handle('proposeTokens', [], () => tokenBranches.propose());
	handle('forgetTokenBranch', [], () => (tokenBranches.forget(), null));
	handle('voiceAndTone', [], () => voiceFile().current());
	handle('saveVoiceAndTone', [ds.voice, ds.against], (text, against) => voiceFile().save(text, against));
	handle('proposeVoiceAndTone', [], () => voiceFile().propose());
	handle('forgetVoiceBranch', [], () => (voiceFile().forget(), null));
	handle('designSystems', [], () => designSystems.read());
};
