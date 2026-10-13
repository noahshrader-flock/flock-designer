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
