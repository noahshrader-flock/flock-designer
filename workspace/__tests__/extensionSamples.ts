import type { Catalog, CatalogComponent, DesignToken } from '../src/shared/domain/designSystem';
import { undeclared } from '../src/shared/wcag';
import type { Project, ProjectWork } from '../src/shared/domain/projects';
import { aVersion } from './fixtures';

/**
 * Sample data for DSNR's panel in tests: a few projects and a design system's catalog, in the app's own shapes, so the
 * panel is tested with the data it is given.
 */

/** A version of the sample project, with its open comments, made on day `day` of the month. */
const version = (name: string, openComments = 0, day = 1): ProjectWork =>
	aVersion('sample', name, { openComments, createdAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00Z` });

const project = (id: string, title: string, folder: string | null, work: ProjectWork[]): Project => ({
	id,
	title,
	folder,
	records: [],
	work,
	people: [],
});

export const SAMPLE_PROJECTS: Project[] = [
	project('alert-history', 'Alert history', 'Admin', [version('v1', 0, 1), version('v2', 2, 2), version('v3', 0, 3)]),
	project('admin-usage', 'Admin usage', null, [version('v1'), version('v2', 0, 2)]),
	project('role-comparison', 'Role comparison', null, [version('v1', 5)]),
	project('zone-coverage', 'Zone coverage', 'Maps', [version('v1'), version('v2', 0, 2)]),
];

const component = (group: string, name: string, storybook: string | null = null): CatalogComponent => ({
	id: `src/components/${name}/${name}.stories.tsx`,
	name,
	group,
	subtitle: null,
	storybook,
	source: `https://github.com/flocksafety/flock-react-component-lib/tree/develop/src/components/${name}`,
});

const token = (t: Partial<DesignToken> & Pick<DesignToken, 'path' | 'category' | 'group' | 'set' | 'name' | 'value'>): DesignToken => ({
	kind: 'color',
	source: { file: 'src/colors/theme/light.ts', line: 10 },
	...t,
});

/** A design system's tokens, as its readers give them: a tone, a role pointing at it with its pair, a spacing and a radius. */
export const SAMPLE_TOKENS: DesignToken[] = [
	token({
		path: 'palette.light.primary.main',
		category: 'Color',
		group: 'Light',
		set: 'primary',
		name: 'main',
		value: '#1F6F5C',
		ref: { path: 'tone.pineGreen.50' },
	}),
	token({ path: 'palette.light.primary.contrastText', category: 'Color', group: 'Light', set: 'primary', name: 'contrastText', value: '#FFFFFF' }),
	token({
		path: 'palette.dark.primary.main',
		category: 'Color',
		group: 'Dark',
		set: 'primary',
		name: 'main',
		value: '#15584A',
		ref: { path: 'tone.pineGreen.60' },
		source: { file: 'src/colors/theme/dark.ts', line: 10 },
	}),
	token({
		path: 'tone.pineGreen.50',
		category: 'Color',
		group: 'Tones',
		set: 'pineGreen',
		name: '50',
		value: '#1F6F5C',
		source: { file: 'src/colors/tones.ts', line: 3 },
	}),
	token({
		path: 'tone.pineGreen.60',
		category: 'Color',
		group: 'Tones',
		set: 'pineGreen',
		name: '60',
		value: '#15584A',
		source: { file: 'src/colors/tones.ts', line: 4 },
	}),
	token({
		path: 'spacing',
		kind: 'dimension',
		category: 'Spacing',
		group: 'Spacing',
		set: 'Spacing',
		name: 'spacing',
		value: '8px',
		source: { file: 'src/theme.ts', line: 20 },
	}),
	token({
		path: 'radius',
		kind: 'dimension',
		category: 'Shape',
		group: 'Radius',
		set: 'Radius',
		name: 'radius',
		value: '4px',
		source: { file: 'src/theme.ts', line: 21 },
	}),
	token({
		path: 'typography.fontFamily',
		kind: 'font',
		category: 'Typography',
		group: 'Family',
		set: 'Family',
		name: 'fontFamily',
		value: 'Inter',
		source: { file: 'src/theme.ts', line: 30 },
	}),
];

/** A design system's catalog as the core reads it: its components in groups, its tokens, on develop. */
export const SAMPLE_CATALOG: Extract<Catalog, { state: 'ready' }> = {
	state: 'ready',
	branch: 'develop',
	commit: 'abc123',
	showing: null,
	committedAt: '2026-10-12T10:00:00Z',
	update: 'unchanged',
	components: [
		component('Buttons', 'FSButton', 'https://storybook.example/?path=/docs/buttons-fsbutton--docs'),
		component('Buttons', 'FSIconButton'),
		component('Buttons', 'FSSplitButton'),
		component('Inputs', 'FSTextField'),
		component('Inputs', 'FSSelect'),
		component('Feedback', 'FSAlert'),
		component('Feedback', 'FSPulsingBadge'),
	],
	tokens: { source: 'theme files', tokens: SAMPLE_TOKENS, problems: [], looked: ['theme files', 'CSS variables', 'design token files'] },
	accessibility: undeclared('none declared'),
};
