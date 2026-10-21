import { isPrototypeName } from './prototypeNames';
import { assertCover } from './validate';

/**
 * A prototype has no git branch; its key where a branch name goes is `prototype/<project-id>/<name>`, which no
 * repository's branch pattern makes, so it is never mistaken for one.
 */
const PROTOTYPE_PREFIX = 'prototype/';

export const isPrototypeKey = (branch: string): boolean => branch.startsWith(PROTOTYPE_PREFIX);

export const prototypeKey = (projectId: string, name: string): string => `${PROTOTYPE_PREFIX}${projectId}/${name}`;

export const projectDir = (projectId: string): string => `projects/${projectId}`;

export const projectPath = (projectId: string, file: string): string => `${projectDir(projectId)}/${file}`;

export const WORK_FILE = 'work.json';
export const workPath = (projectId: string): string => projectPath(projectId, WORK_FILE);

/** What was asked for a version, in order: one file for each, as a version's page is. */
export const requestsPath = (projectId: string, name: string): string => projectPath(projectId, `requests-${name}.md`);

export const prototypePagePath = (projectId: string, name: string): string => projectPath(projectId, `prototypes/${name}.html`);

export const prototypeSourcePath = (projectId: string, name: string): string => projectPath(projectId, `prototypes/${name}.tsx`);

/** `name` null: the product's own app (`dsnr accessibility`). */
export const accessibilityPath = (projectId: string, name: string | null): string => `${accessibilityEvidenceDir(projectId, name)}.json`;

export const accessibilityLedgerPath = (projectId: string, name: string | null): string => `${accessibilityEvidenceDir(projectId, name)}.ledger.json`;

export const accessibilityEvidenceDir = (projectId: string, name: string | null): string => projectPath(projectId, `accessibility/${name ?? 'app'}`);

/** Made unique among the measure's views (`home`, `home-2`), so two never share one, whatever script the names are in. */
export const accessibilityViewDirs = (projectId: string, name: string | null, views: string[]): Map<string, string> => {
	const taken = new Set<string>();
	return new Map(
		views.map((view) => {
			const base =
				view
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '-')
					.replace(/^-|-$/g, '') || 'view';
			let folder = base;
			for (let n = 2; taken.has(folder); n++) folder = `${base}-${n}`;
			taken.add(folder);
			return [view, `${accessibilityEvidenceDir(projectId, name)}/${folder}`];
		}),
	);
};

export const accessibilityReturnedPath = (projectId: string): string => projectPath(projectId, 'accessibility/returned.md');
export const accessibilityReturnedRecordPath = (projectId: string): string => projectPath(projectId, 'accessibility/returned.json');
export const accessibilityGuardsPath = (projectId: string): string => projectPath(projectId, 'accessibility/guards.md');

/**
 * In a folder of its own, so a picture is never one of the project's documents, and named by the page's hash, so a file
 * never changes under its name.
 */
export const coverPath = (projectId: string, name: string, cover: string): string => {
	assertCover(cover);
	return projectPath(projectId, `covers/${name}-${cover}.jpg`);
};

/** From the site's root. */
export const sitePath = (projectId: string, name: string): string | null => (isPrototypeName(name) ? `${projectId}/${name}/` : null);

/** Large files pages share (fonts, mostly), kept once as the data they were embedded as, named by their content's hash. */
export const SHARED_DIR = 'projects/_shared';
export const sharedFilePath = (hash: string): string => `${SHARED_DIR}/${hash}.datauri`;
export const SHARED_REF = /\/_shared\/([0-9a-f]{16})\b/g;

export const sharedFilesOf = (html: string): string[] => [...new Set([...html.matchAll(SHARED_REF)].map((m) => m[1] as string))];
