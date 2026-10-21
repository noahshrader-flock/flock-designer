import { join } from 'node:path';
import type { ChangeKind } from '../shared/contract';

/** The file names are the ones each has always had, so an update reads what an older version kept: never rename one. */
export const appPaths = (userData: string) => ({
	checkout: join(userData, 'checkout.json'),
	designSystems: join(userData, 'design-system.json'),
	/** What the person said of a design system that could not be confirmed as its package's source. */
	designSystemSources: join(userData, 'design-system-sources.json'),
	/** Where the person keeps each design repository's clone, when it is not beside a product. */
	designRepositories: join(userData, 'design-repositories.json'),
	changeBranches: {
		tokens: join(userData, 'token-branches.json'),
		values: join(userData, 'value-branches.json'),
		voice: join(userData, 'voice-branch.json'),
		handOver: join(userData, 'handoff-branches.json'),
	} satisfies Record<ChangeKind, string>,
	/** Encrypted by the system's keychain. */
	githubToken: join(userData, 'github-token.enc'),
	prototypes: join(userData, 'prototypes'),
	storyPreviews: join(userData, 'story-previews'),
	splitChecks: join(userData, 'split-checks'),
	componentPictures: join(userData, 'component-pictures'),
});

export type AppPaths = ReturnType<typeof appPaths>;
