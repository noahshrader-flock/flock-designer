import { matchesWords } from './search';
import { HOSTED_STORYBOOKS } from './config';
import type { StoryPreview } from './contract';
import { type Theme, withTheme } from './prototypeTheme';

export interface DesignSystem {
	repository: string;
	branch: string;
	/** Ends in `/`. */
	storybook: string | null;
}

export const designSystemOf = ({ repository, branch }: { repository: string; branch: string }): DesignSystem => ({
	repository,
	branch,
	storybook: HOSTED_STORYBOOKS[repository.toLowerCase()] ?? null,
});

/** Token pages are left out of the components: the tokens panel shows the same from the source. */
export const isTokenGroup = (group: string): boolean => /\btokens?\b/i.test(group);

const matchesComponent = (component: { name: string; group: string }, search: string): boolean =>
	matchesWords(`${component.name}\n${component.group}`, search);

/** The one thing a preview page tells the frame holding it. */
export const PREVIEW_HEIGHT = 'flockPreviewHeight';
export const PREVIEW_FILE = 'file';
/** Draws another story file in place of the last without loading again. */
export const PREVIEW_SHOW = '__dsnrShow';
/** The story file's default export's `component`, with its `args` and `argTypes`, or null when it names none. */
export const PREVIEW_COMPONENT = '__dsnrComponent';
export const PREVIEW_TRY = 'dsnrTryValues';
/** `page/theme.ts` applies `theme` whatever the machine is set to. */
export const previewAddress = (base: string, file: string, theme: Theme | null = null): string =>
	withTheme(`${base}?${PREVIEW_FILE}=${encodeURIComponent(file)}`, theme);

/** Drawn by the preview page, so the design system's own CSS loads its fonts. */
export interface SpecimenLine {
	key: string;
	label: string;
	family?: string;
	size?: string;
	weight?: string;
	lineHeight?: string;
}
export const PREVIEW_SPECIMEN = 'specimen';
export const specimenAddress = (base: string, lines: SpecimenLine[]): string =>
	`${base}?${PREVIEW_SPECIMEN}=${encodeURIComponent(JSON.stringify(lines))}`;

/** Starts with a colon, or is empty when nothing is wrong. */
export const notBuilt = (preview: StoryPreview): string =>
	preview.state === 'no-packages'
		? `: its packages are not installed (run npm install in ${preview.root})`
		: preview.state === 'failed'
			? `: ${preview.error}`
			: '';

/** In the order the library lists them; a group with nothing found is left out. */
export const groupsFound = <C extends { name: string; group: string }>(components: C[], search: string): { group: string; components: C[] }[] => {
	const groups: { group: string; components: C[] }[] = [];
	for (const c of components.filter((each) => matchesComponent(each, search))) {
		const last = groups.at(-1);
		if (last?.group === c.group) last.components.push(c);
		else groups.push({ group: c.group, components: [c] });
	}
	return groups;
};

export const previewProblem = (preview: Exclude<StoryPreview, { state: 'ready' }>): string =>
	preview.state === 'no-packages'
		? `The design system's packages are not installed in ${preview.root}. Run npm install there, then try again.`
		: preview.state === 'no-library'
			? 'No design system is shown.'
			: preview.error;
