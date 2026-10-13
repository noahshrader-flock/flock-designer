import type { Catalog } from '../extension/webview/DesignSystem';
import type { CatalogComponent } from '../src/shared/domain/designSystem';
import type { Project, ProjectIteration } from '../src/shared/domain/projects';

/**
 * Sample data for DSNR's panel in tests: a few projects and a design system's catalog, in the app's own shapes, so the
 * panel is tested with the data it is given.
 */

const iteration = (name: string, openComments = 0, day = 1): ProjectIteration => ({
	name,
	branch: `prototype/sample/${name}`,
	issueNumber: null,
	openComments,
	previewUrl: null,
	commit: null,
	contributors: [],
	createdAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00Z`,
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
	project('alert-history', 'Alert history', 'Admin', [iteration('v1-i1', 0, 1), iteration('v1-i2', 2, 2), iteration('v2-i1', 0, 3)]),
	project('admin-usage', 'Admin usage', null, [iteration('v1-i1'), iteration('v1-i2')]),
	project('role-comparison', 'Role comparison', null, [iteration('v1-i1', 5)]),
	project('zone-coverage', 'Zone coverage', 'Maps', [iteration('v1-i1'), iteration('v1-i2')]),
];

const component = (group: string, name: string): CatalogComponent => ({
	id: `src/components/${name}/${name}.stories.tsx`,
	name,
	group,
	subtitle: null,
	storybook: null,
	source: '',
});

export const SAMPLE_CATALOG: Catalog = {
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
