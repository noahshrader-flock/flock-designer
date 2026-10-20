import type { CallsDeps } from '../compose';
import type { ChangeBranchOf, ChangeKind, ChangeKinds, HandedChange, SavedKind, TokenEdit, TriedValue } from '../../shared/contract';
import { handOver } from '../services/agent/handOver';
import { type ChangeBranches, scopeOf } from '../services/designSystem/changeBranches';
import { offBase } from '../services/designSystem/handOverBranches';
import { readVoice } from '../services/designSystem/voiceAndTone';

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
		voiceBranches,
		agent,
		handOverBranches,
		libraryShown,
		ports,
		shownSystem,
		valueSources,
		warm,
	} = d;
	const saved: { [K in SavedKind]: ChangeBranches<ChangeKinds[K]> } = { tokens: tokenBranches, values: valueBranches, voice: voiceBranches };
	const branches = { ...saved, handOver: handOverBranches };
	return {
		componentPictures: () => componentTokens.pictures(),
		designSystemCatalog: async (refresh: boolean) => {
			const catalog = await library.catalog(refresh);
			if (catalog.state === 'ready') warm();
			return catalog;
		},
		// Its edits are checked again before anything is written.
		storyPreview: (edits: TokenEdit[]) => previews.preview(edits),
		componentTokens: (file: string) => componentTokens.of(file),
		componentVariants: (file: string) => componentVariants.of(file),
		tokenUsers: (path: string) => componentTokens.users(path),
		changeReach: (edits: TokenEdit[]) => componentTokens.reach(edits),
		// Each value is written only as the number or colour it reads as, where it was found.
		valueSources: (file: string, tried: TriedValue[]) => valueSources.of(file, tried),
		handOverChanges: async (file: string | null, change: HandedChange) => {
			if ((file === null) !== 'edits' in change)
				throw new Error('The token changes are handed over as the tokens, and a component’s values as that component.');
			libraryShown.refuse(shownSystem(), 'process changes');
			// Not opened, it is not handed over: forgotten, so it can be pressed again.
			const { handed, prepared } = await handOver(
				ports,
				agent(),
				() => handOverBranches.start(file ?? '', change),
				() => handOverBranches.forget(file ?? ''),
			);
			return { branch: prepared.branch, ...handed };
		},
		changeBranch: <K extends ChangeKind>(kind: K, scope: string | null) =>
			branches[kind].current(scopeOf(branches[kind].rules, scope)) as Promise<ChangeBranchOf<K> | null>,
		changeScopes: (kind: ChangeKind) => branches[kind].scopes(),
		// Never while another branch is shown: a value's save writes the files the index drew.
		saveChange: <K extends SavedKind>(kind: K, scope: string | null, change: unknown) => {
			libraryShown.refuse(shownSystem(), 'save');
			const kept = saved[kind];
			return kept.save(kept.rules.check(change), scopeOf(kept.rules, scope)) as Promise<ChangeBranchOf<K>>;
		},
		// At the commit the person looked at, so what is pushed is what they saw.
		proposeChange: <K extends ChangeKind>(kind: K, scope: string | null, seen: { tip: string; confirmed: boolean } | null) => {
			libraryShown.refuse(shownSystem(), 'propose');
			const at = scopeOf(branches[kind].rules, scope);
			if (kind !== 'handOver') return saved[kind as SavedKind].propose(at) as Promise<ChangeBranchOf<K>>;
			if (seen === null) throw new Error('A hand-over is proposed at the commit that was shown.');
			return handOverBranches.propose(at, seen.tip, seen.confirmed) as Promise<ChangeBranchOf<K>>;
		},
		forgetChange: (kind: ChangeKind, scope: string | null) => {
			const at = scopeOf(branches[kind].rules, scope);
			const system = shownSystem();
			if (kind === 'handOver' && system !== null && libraryShown.scope(system) === at) libraryShown.stop(system);
			branches[kind].forget(at);
			return null;
		},
		// Only committed work is shown, read from git's objects.
		showHandOver: async (file: string | null) => {
			const system = shownSystem();
			if (system === null) throw new Error('There is no design system connected.');
			const handed = await handOverBranches.current(file ?? '');
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
		writeValue: async (file: string, value: TriedValue) => {
			libraryShown.refuse(shownSystem(), 'have the agent write it');
			await valueAgent.write(file, value);
			return null;
		},
		// Read from the library's branch once it is brought up to date, so a commit made on GitHub shows.
		voiceAndTone: async () => {
			const system = shownSystem();
			if (system === null) throw new Error('No design system is connected. Connect one in Components: its voice and tone is in its agent files.');
			await library.update(system);
			return readVoice(system);
		},
		designSystems: () => designSystems.read(),
	};
};

export type DesignSystemArea = ReturnType<typeof designSystemArea>;
