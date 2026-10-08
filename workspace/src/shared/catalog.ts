/**
 * A design system library the Design System tab accepts: the repository, the branch that is its source of truth, and
 * where its Storybook is hosted, if anywhere. Everything the tab knows about a library that it cannot read from the
 * library itself. A second design system is one more entry.
 */
export interface DesignSystem {
	/** `owner/repo` on GitHub. */
	repository: string;
	/** The branch the tab reads and previews, as GitHub has it. */
	branch: string;
	/** The hosted Storybook's address, ending in `/`, or null when it has none: the Storybook links are then left out. */
	storybook: string | null;
}

export const DESIGN_SYSTEMS: DesignSystem[] = [
	{ repository: 'flocksafety/flock-react-component-lib', branch: 'develop', storybook: 'https://develop--6617f3c579abb5c5e780fddc.chromatic.com/' },
];

/** The design system whose repository is `repo` (`owner/repo`, any case), or null. */
export const designSystemNamed = (repo: string | null): DesignSystem | null =>
	repo === null ? null : (DESIGN_SYSTEMS.find((d) => d.repository.toLowerCase() === repo.toLowerCase()) ?? null);

/** Whether `repo` is a design system library: by name when one is chosen to clone, by `origin` when one is found. */
export const isDesignSystem = (repo: string | null): boolean => designSystemNamed(repo) !== null;

/** The one thing a preview page tells the frame holding it: its height, under this name. */
export const PREVIEW_HEIGHT = 'flockPreviewHeight';
/** Which story file a preview page draws, by this address parameter. */
export const PREVIEW_FILE = 'file';
/** A story file's preview page, in the build served at `base`. */
export const previewAddress = (base: string, file: string): string => `${base}?${PREVIEW_FILE}=${encodeURIComponent(file)}`;
