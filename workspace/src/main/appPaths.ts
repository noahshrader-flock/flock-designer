import { join } from 'node:path';

/**
 * The app's own folder (Electron's userData), the one place it is described: what each file and folder in it is for. The
 * names are the ones each has always had, so an update reads what an older version kept.
 */
export const appPaths = (userData: string) => ({
	/** The product checkout the person chose. */
	checkout: join(userData, 'checkout.json'),
	/** Where their clones go. */
	cloneFolder: join(userData, 'clone-folder.json'),
	/** The design systems connected, and which is shown. */
	designSystems: join(userData, 'design-system.json'),
	/** Auto, light or dark. */
	appearance: join(userData, 'appearance.json'),
	/** The window's size and place. */
	window: join(userData, 'window.json'),
	/** The latest agent conversation for each branch, to continue in the editor. */
	agentSessions: join(userData, 'agent-sessions.json'),
	/** The branch each design system's token change is kept on. */
	tokenBranches: join(userData, 'token-branches.json'),
	/** The branch the voice and tone change is kept on. */
	voiceBranch: join(userData, 'voice-branch.json'),
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
