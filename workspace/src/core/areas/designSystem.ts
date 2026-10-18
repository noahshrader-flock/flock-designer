import type { CallsDeps } from '../compose';
import type { TokenEdit, TriedValue } from '../../shared/contract';
import type { HandedChange } from '../../shared/contract';
import { handToClaude } from '../services/agent/editor';
import { offBase } from '../services/designSystem/handoffBranches';

/** What the DesignSystem calls do, each called by its handler once its arguments are checked (`calls/designSystem.ts`). */
export const designSystemArea = (d: CallsDeps) => {
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
		libraryShown,
		ports,
		shownSystem,
		valueSources,
		voiceFile,
		warm,
	} = d;
	return {
		componentPictures: () => componentTokens.pictures(),
		// The window says only whether to wait for the update; where the design system is, it is never told and never asks.
		designSystemCatalog: async (refresh: boolean) => {
			const catalog = await library.catalog(refresh);
			if (catalog.state === 'ready') warm();
			return catalog;
		},
		// A change is only ever a list of token edits, checked here and again before anything is written (T3, T4).
		storyPreview: (edits: TokenEdit[]) => previews.preview(edits),
		// The window names a story file, and only a story file of the library is answered.
		componentTokens: (file: string) => componentTokens.of(file),
		componentVariants: (file: string) => componentVariants.of(file),
		tokenUsers: (path: string) => componentTokens.users(path),
		// What a change reaches is asked for by the change, checked as a change always is.
		changeReach: (edits: TokenEdit[]) => componentTokens.reach(edits),
		// Values tried on a component's instances, by its story file: checked as the contract says one is, and written only as
		// the number or colour each reads as, where it was found (Phase 4).
		valueSources: (file: string, tried: TriedValue[]) => valueSources.of(file, tried),
		valueBranch: (file: string) => valueBranches.current(file),
		valueBranchFiles: () => valueBranches.scopes(),
		// Process changes: a unit by its story file, or the tokens (none); what it hands over checked as a change always is, and
		// handed to Claude Code as every hand-over is, in the library's root, with the prompt typed in.
		handOverChanges: async (file: string | null, change: HandedChange) => {
			if ((file === null) !== 'edits' in change)
				throw new Error('The token changes are handed over as the tokens, and a component’s values as that component.');
			libraryShown.refuse(shownSystem(), 'process changes');
			const { root, branch, prompt } = await handoffBranches.start(file ?? '', change);
			// Not opened, it is not handed over: forgotten, so it can be pressed again.
			const handed = await handToClaude(ports, root, prompt).catch((err: unknown) => {
				handoffBranches.forget(file ?? '');
				throw err;
			});
			return { branch, ...handed };
		},
		handoffBranch: (file: string | null) => handoffBranches.current(file ?? ''),
		handoffFiles: () => handoffBranches.scopes(),
		// At the commit the person looked at: what is pushed is what they saw. Never while another branch is shown, as no proposal is.
		proposeHandoff: (file: string | null, tip: string, confirmed: boolean) => {
			libraryShown.refuse(shownSystem(), 'propose');
			return handoffBranches.propose(file ?? '', tip, confirmed);
		},
		// Forgotten, its branch is no longer shown either.
		forgetHandoff: (file: string | null) => {
			const system = shownSystem();
			if (system !== null && libraryShown.scope(system) === (file ?? '')) libraryShown.stop(system);
			handoffBranches.forget(file ?? '');
			return null;
		},
		// Preview this branch (Phase 2): a unit's hand-over shown in the tab once its branch is read ready from git, and the
		// library's own branch again. Only committed work is shown, read from git's objects.
		showHandoff: async (file: string | null) => {
			const system = shownSystem();
			if (system === null) throw new Error('There is no design system connected.');
			const handed = await handoffBranches.current(file ?? '');
			if (handed === null) throw new Error('Nothing is handed to Claude Code for this.');
			if (handed.review.state === 'off-base') throw new Error(offBase(handed.branch, system.branch));
			if (handed.review.state !== 'ready')
				throw new Error(`Nothing is committed on ${handed.branch} yet, so there is nothing to show: Claude Code commits its work there.`);
			libraryShown.show(system, file ?? '', handed.branch);
			return null;
		},
		showLibraryBranch: () => {
			const system = shownSystem();
			if (system !== null) libraryShown.stop(system);
			return null;
		},
		// Only on the person's press: it runs the agent, in a copy of the library.
		writeValue: async (file: string, value: TriedValue) => {
			libraryShown.refuse(shownSystem(), 'have the agent write it');
			await valueAgent.write(file, value);
			return null;
		},
		// Never while another branch is shown: a value's save writes the files the index drew.
		saveValues: (file: string, tried: TriedValue[]) => (libraryShown.refuse(shownSystem(), 'save'), valueBranches.save(tried, file)),
		proposeValues: (file: string) => (libraryShown.refuse(shownSystem(), 'propose'), valueBranches.propose(file)),
		forgetValueBranch: (file: string) => (valueBranches.forget(file), null),
		tokenBranch: () => tokenBranches.current(),
		saveTokens: (edits: TokenEdit[]) => (libraryShown.refuse(shownSystem(), 'save'), tokenBranches.save(edits)),
		proposeTokens: () => (libraryShown.refuse(shownSystem(), 'propose'), tokenBranches.propose()),
		forgetTokenBranch: () => (tokenBranches.forget(), null),
		voiceAndTone: () => voiceFile().current(),
		saveVoiceAndTone: (text: string, against: string | null) => voiceFile().save(text, against),
		proposeVoiceAndTone: () => voiceFile().propose(),
		forgetVoiceBranch: () => (voiceFile().forget(), null),
		designSystems: () => designSystems.read(),
	};
};

export type DesignSystemArea = ReturnType<typeof designSystemArea>;
