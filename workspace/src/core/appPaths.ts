import { join } from 'node:path';
import type { ChangeKind } from '../shared/contract';

/**
 * DSNR's own folder (the extension's global storage), the one place it is described: what each file and folder in it is for. The
 * names are the ones each has always had, so an update reads what an older version kept.
 */
export const appPaths = (userData: string) => ({
	/** The product checkout the person chose. */
	checkout: join(userData, 'checkout.json'),
	/** The design systems connected, and which is shown. */
	designSystems: join(userData, 'design-system.json'),
	/** The latest agent conversation for each branch, to continue in the editor. */
	agentSessions: join(userData, 'agent-sessions.json'),
	/**
	 * The branch each change to a design system is kept on, a file for each kind (`ChangeKinds`): its tokens, each
	 * component's values, its voice and tone, and each unit handed to Claude Code.
	 */
	changeBranches: {
		tokens: join(userData, 'token-branches.json'),
		values: join(userData, 'value-branches.json'),
		voice: join(userData, 'voice-branch.json'),
		handOver: join(userData, 'handoff-branches.json'),
	} satisfies Record<ChangeKind, string>,
	/** The GitHub sign-in, encrypted by the system's keychain. */
	githubToken: join(userData, 'github-token.enc'),
	/** Prototypes, built here before they are saved. */
	prototypes: join(userData, 'prototypes'),
	/** The design system's stories, built to preview. */
	storyPreviews: join(userData, 'story-previews'),
	/** Pictures of each component. */
	componentPictures: join(userData, 'component-pictures'),
});

export type AppPaths = ReturnType<typeof appPaths>;
