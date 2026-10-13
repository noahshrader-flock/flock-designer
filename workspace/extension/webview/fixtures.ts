import type { CatalogComponent } from '../../src/shared/domain/designSystem';
import type { Project, ProjectIteration } from '../../src/shared/domain/projects';

/**
 * What the panel shows until it is connected to DSNR's services (Phase 0): a few projects, in the app's own shapes, so the
 * screens are drawn from the data they will be given and nothing changes when the real data arrives.
 */

const iteration = (name: string, openComments = 0): ProjectIteration => ({
	name,
	branch: `prototype/sample/${name}`,
	issueNumber: null,
	openComments,
	previewUrl: null,
	commit: null,
	contributors: [],
	createdAt: '2026-10-01T10:00:00Z',
	route: null,
	repository: null,
	pullRequest: null,
	cover: null,
});

const project = (id: string, title: string, folder: string | null, iterations: ProjectIteration[]): Project => ({
	id,
	title,
	folder,
	records: [],
	iterations,
	people: [],
});

export const SAMPLE_PROJECTS: Project[] = [
	project('alert-history', 'Alert history', 'Admin', [iteration('v1-i1'), iteration('v1-i2', 2), iteration('v2-i1')]),
	project('admin-usage', 'Admin usage', null, [iteration('v1-i1'), iteration('v1-i2')]),
	project('role-comparison', 'Role comparison', null, [iteration('v1-i1', 5)]),
	project('zone-coverage', 'Zone coverage', 'Maps', [iteration('v1-i1'), iteration('v1-i2')]),
];

/** A design system found beside the product: its components, by their Storybook group, and its tokens by category. */
export interface SampleDesignSystem {
	components: CatalogComponent[];
	tokens: { category: string; count: number; icon: string }[];
}

const component = (group: string, name: string): CatalogComponent => ({
	id: `src/components/${name}/${name}.stories.tsx`,
	name,
	group,
	subtitle: null,
	storybook: null,
	source: '',
});

export const SAMPLE_DESIGN_SYSTEM: SampleDesignSystem = {
	components: [
		component('Buttons', 'FSButton'),
		component('Buttons', 'FSIconButton'),
		component('Buttons', 'FSSplitButton'),
		component('Inputs', 'FSTextField'),
		component('Inputs', 'FSSelect'),
		component('Feedback', 'FSAlert'),
		component('Feedback', 'FSPulsingBadge'),
	],
	tokens: [
		{ category: 'Color', count: 42, icon: 'symbol-color' },
		{ category: 'Spacing', count: 9, icon: 'symbol-ruler' },
		{ category: 'Shape', count: 4, icon: 'symbol-misc' },
	],
};
