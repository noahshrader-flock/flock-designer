/**
 * The design system the Design System tab reads, as the catalog needs it: the repository, the branch that is its source
 * of truth (the repository's default, decision 24), and where its Storybook is hosted, if anywhere. Made from what was
 * connected (`ConnectedDesignSystem`); nothing here decides what may be connected (decision 23).
 */
export interface DesignSystem {
	/** `owner/repo` on GitHub. */
	repository: string;
	/** The branch the tab reads and previews, as GitHub has it. */
	branch: string;
	/** The hosted Storybook's address, ending in `/`, or null when it has none: the Storybook links are then left out. */
	storybook: string | null;
}

/**
 * Where a repository's Storybook is hosted, for the ones the app knows: a hint, since a library does not say it in its
 * files. Any other design system has no Storybook links, and is read the same in every other way.
 */
const HOSTED_STORYBOOKS: Record<string, string> = {
	'flocksafety/flock-react-component-lib': 'https://develop--6617f3c579abb5c5e780fddc.chromatic.com/',
};

/** The design system the catalog reads, from what was connected. */
export const designSystemOf = ({ repository, branch }: { repository: string; branch: string }): DesignSystem => ({
	repository,
	branch,
	storybook: HOSTED_STORYBOOKS[repository.toLowerCase()] ?? null,
});

/**
 * Whether a Storybook group holds the library's token pages (`Design Tokens`, `Tokens`): they are documentation of the
 * tokens, not components, so they leave the list once the tokens panel shows the same from the source (decision 22).
 */
export const isTokenGroup = (group: string): boolean => /\btokens?\b/i.test(group);

/** The one thing a preview page tells the frame holding it: its height, under this name. */
export const PREVIEW_HEIGHT = 'flockPreviewHeight';
/** Which story file a preview page draws, by this address parameter. */
export const PREVIEW_FILE = 'file';
/** A story file's preview page, in the build served at `base`. */
export const previewAddress = (base: string, file: string): string => `${base}?${PREVIEW_FILE}=${encodeURIComponent(file)}`;
