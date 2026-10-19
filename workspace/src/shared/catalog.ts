import { matchesWords } from './search';
import { HOSTED_STORYBOOKS } from './config';
import type { StoryPreview } from './contract';
import { type Theme, withTheme } from './prototypeTheme';

/**
 * The design system the Design System tab reads, as the catalog needs it: the repository, the branch that is its source
 * of truth (the repository's default), and where its Storybook is hosted, if anywhere. Made from what was connected
 * (`ConnectedDesignSystem`); nothing here decides what may be connected.
 */
export interface DesignSystem {
	/** `owner/repo` on GitHub. */
	repository: string;
	/** The branch the tab reads and previews, as GitHub has it. */
	branch: string;
	/** The hosted Storybook's address, ending in `/`, or null when it has none: the Storybook links are then left out. */
	storybook: string | null;
}

/** The design system the catalog reads, from what was connected. */
export const designSystemOf = ({ repository, branch }: { repository: string; branch: string }): DesignSystem => ({
	repository,
	branch,
	storybook: HOSTED_STORYBOOKS[repository.toLowerCase()] ?? null,
});

/**
 * Whether a Storybook group holds the library's token pages (`Design Tokens`, `Tokens`): they are documentation of the
 * tokens, not components, so they are left out of the list: the tokens panel shows the same from the source.
 */
export const isTokenGroup = (group: string): boolean => /\btokens?\b/i.test(group);

/** Whether a component is one the Components tab's search finds: by its name or its group, as `matchesWords` finds. */
const matchesComponent = (component: { name: string; group: string }, search: string): boolean =>
	matchesWords(`${component.name}\n${component.group}`, search);

/** The one thing a preview page tells the frame holding it: its height, under this name. */
export const PREVIEW_HEIGHT = 'flockPreviewHeight';
/** Which story file a preview page draws, by this address parameter. */
export const PREVIEW_FILE = 'file';
/** What the preview page is told to draw another story file in place of the last with, without loading again. */
export const PREVIEW_SHOW = '__dsnrShow';
/**
 * Where the preview page keeps the component the story file it draws is of (its default export's `component`), with the
 * props it names as controls (its `args` and `argTypes`), or null when it names none.
 */
export const PREVIEW_COMPONENT = '__dsnrComponent';
/** What a tab says to the preview page it frames to try values on the component's instances. */
export const PREVIEW_TRY = 'dsnrTryValues';
/**
 * A story file's preview page, in the build served at `base`, in `theme` (`page/theme.ts` puts it there, whatever the machine
 * is set to): the one way a frame, and a drawing of the values, are put in dark.
 */
export const previewAddress = (base: string, file: string, theme: Theme | null = null): string =>
	withTheme(`${base}?${PREVIEW_FILE}=${encodeURIComponent(file)}`, theme);

/**
 * One line of a type specimen: what it is called, and the font it is drawn in, each part
 * only when the design system says it. Drawn by the preview page, so the design system's own CSS loads its fonts.
 */
export interface SpecimenLine {
	key: string;
	label: string;
	family?: string;
	size?: string;
	weight?: string;
	lineHeight?: string;
}
/** Which lines a preview page draws as a type specimen, instead of a story file, by this address parameter. */
export const PREVIEW_SPECIMEN = 'specimen';
/** A preview page that draws `lines` as a type specimen, in the build served at `base`. */
export const specimenAddress = (base: string, lines: SpecimenLine[]): string =>
	`${base}?${PREVIEW_SPECIMEN}=${encodeURIComponent(JSON.stringify(lines))}`;

/** Why something drawn in the preview build (a type specimen) cannot be, from what the build said, after a colon; or nothing. */
export const notBuilt = (preview: StoryPreview): string =>
	preview.state === 'no-packages'
		? `: its packages are not installed (run npm install in ${preview.root})`
		: preview.state === 'failed'
			? `: ${preview.error}`
			: '';

/** The components a search finds, in their groups in the order the library lists them; a group with nothing found is left out. */
export const groupsFound = <C extends { name: string; group: string }>(components: C[], search: string): { group: string; components: C[] }[] => {
	const groups: { group: string; components: C[] }[] = [];
	for (const c of components.filter((each) => matchesComponent(each, search))) {
		const last = groups.at(-1);
		if (last?.group === c.group) last.components.push(c);
		else groups.push({ group: c.group, components: [c] });
	}
	return groups;
};

/** Why a component's previews could not be built, in words a person can act on: what the build said. */
export const previewProblem = (preview: Exclude<StoryPreview, { state: 'ready' }>): string =>
	preview.state === 'no-packages'
		? `The design system's packages are not installed in ${preview.root}. Run npm install there, then try again.`
		: preview.state === 'no-library'
			? 'No design system is shown.'
			: preview.error;
