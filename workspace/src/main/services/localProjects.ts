import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Project, ProjectIteration } from '../../shared/contract';
import { asPeople, mergePeople } from '../../shared/people';
import { newestFirst } from '../../shared/projects';

const firstHeading = (markdown: string): string | null => {
	for (const line of markdown.split('\n')) {
		const m = /^#\s+(.+?)\s*$/.exec(line);
		if (m?.[1]) return m[1];
	}
	return null;
};

const readJson = (path: string): unknown => {
	try {
		return JSON.parse(readFileSync(path, 'utf8'));
	} catch {
		return null;
	}
};

/**
 * The projects in the local copy of the design repository, read straight from
 * disk. Nothing is registered anywhere: a project folder with an iteration
 * record in it is a project, however it got there.
 *
 * Unreadable pieces are skipped, never fatal -- a half-written record must not
 * hide every other project.
 */
export const readLocalProjects = (recordsRoot: string): Project[] => {
	if (!existsSync(recordsRoot)) return [];
	return readdirSync(recordsRoot, { withFileTypes: true })
		.filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
		.map((e): Project => {
			const dir = join(recordsRoot, e.name);
			const records = readdirSync(dir, { withFileTypes: true }).filter((f) => f.isFile()).map((f) => f.name).sort();
			const brief = records.includes('brief.md') ? firstHeading(readFileSync(join(dir, 'brief.md'), 'utf8')) : null;
			const raw = readJson(join(dir, 'iterations.json'));
			const iterations = (Array.isArray(raw) ? raw : [])
				.filter((it): it is Record<string, unknown> => typeof it === 'object' && it !== null)
				.filter((it) => typeof it.branch === 'string' && typeof it.name === 'string')
				.map(
					(it): ProjectIteration => ({
						name: String(it.name),
						branch: String(it.branch),
						issueNumber: null,
						previewUrl: typeof it.previewUrl === 'string' ? it.previewUrl : null,
						commit: typeof it.commit === 'string' ? it.commit : null,
						contributors: asPeople(it.contributors),
					}),
				)
				.sort(newestFirst);
			return {
				id: e.name,
				title: brief ?? e.name,
				records,
				iterations,
				people: mergePeople(...iterations.map((i) => i.contributors)),
				openComments: 0,
			};
		})
		// A folder with no iterations is a notes folder, not work in progress.
		.filter((p) => p.iterations.length > 0);
};
