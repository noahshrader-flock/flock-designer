import { isPrototypeName } from './prototypeNames';
import { assertCover } from './validate';

/** Where things are in the design repository, and the keys prototypes are known by. */

/**
 * A prototype: one self-contained page, made without running the product, saved in the design repository beside
 * the project's other records. It has no git branch. Its key, in the place a branch name goes (its record, the review
 * thread), is `prototype/<project-id>/<name>`, which no repository's branch pattern makes, so it can never be mistaken
 * for one.
 */
const PROTOTYPE_PREFIX = 'prototype/';

export const isPrototypeKey = (branch: string): boolean => branch.startsWith(PROTOTYPE_PREFIX);

export const prototypeKey = (projectId: string, name: string): string => `${PROTOTYPE_PREFIX}${projectId}/${name}`;

/** A project's folder in the design repository: the one place a project's path is built (the folders plan's rule 3). */
export const projectDir = (projectId: string): string => `projects/${projectId}`;

/** A file in a project's folder in the design repository, by its path from the repository's root. */
export const projectPath = (projectId: string, file: string): string => `${projectDir(projectId)}/${file}`;

/** A project's records, in its folder: one for each version of its prototype, and one for its codebase work. */
export const WORK_FILE = 'work.json';
export const workPath = (projectId: string): string => projectPath(projectId, WORK_FILE);

/** Where a prototype's page is kept in the design repository. */
export const prototypePagePath = (projectId: string, name: string): string => projectPath(projectId, `prototypes/${name}.html`);

/** Its React source, kept beside the page. */
export const prototypeSourcePath = (projectId: string, name: string): string => projectPath(projectId, `prototypes/${name}.tsx`);

/**
 * Where a project's accessibility measure is kept in the design repository, as evidence: of a prototype's page, by its
 * name, or, with none, of the product's own app (`dsnr accessibility`, decision 2 of the accessibility plan).
 */
export const accessibilityPath = (projectId: string, name: string | null): string => `${accessibilityEvidenceDir(projectId, name)}.json`;

/** The run's ledger beside it (A5): a row for each criterion, its status and the evidence it rests on. */
export const accessibilityLedgerPath = (projectId: string, name: string | null): string => `${accessibilityEvidenceDir(projectId, name)}.ledger.json`;

/** The probe's evidence beside it (A3): a folder of the same name, a folder in it per view. */
export const accessibilityEvidenceDir = (projectId: string, name: string | null): string => projectPath(projectId, `accessibility/${name ?? 'app'}`);

/**
 * Each view's folder of that evidence, by the view's name (a state, or a page): its name as letters, digits and dashes,
 * made unique among the measure's views (`home`, `home-2`), so two never share one, whatever script the names are in.
 */
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

/** Where testers return what they find by hand (A9), the record of how each was sorted, and the guards proposed for what was fixed. */
export const accessibilityReturnedPath = (projectId: string): string => projectPath(projectId, 'accessibility/returned.md');
export const accessibilityReturnedRecordPath = (projectId: string): string => projectPath(projectId, 'accessibility/returned.json');
export const accessibilityGuardsPath = (projectId: string): string => projectPath(projectId, 'accessibility/guards.md');

/**
 * Where a prototype's picture is kept in the design repository: in its project's `covers/` folder (a folder, so a picture
 * is never one of the project's documents), named by the prototype and the hash of the page it is of, so a file never
 * changes under its name.
 */
export const coverPath = (projectId: string, name: string, cover: string): string => {
	assertCover(cover);
	return projectPath(projectId, `covers/${name}-${cover}.jpg`);
};

/**
 * Where a version is on the published site, from the site's root: `<project>/v2/`. The one place the site's addresses
 * are made, for the site itself, the command that publishes it and the app that opens it. Null for a name that is not a
 * prototype's.
 */
export const sitePath = (projectId: string, name: string): string | null => (isPrototypeName(name) ? `${projectId}/${name}/` : null);

/**
 * The large files pages share (fonts, mostly), kept once in the design repository as the data they were embedded as, each
 * named by its content's hash; a page names one as `/_shared/<hash>` (`SHARED_REF`), and every reader finds them by these.
 */
export const SHARED_DIR = 'projects/_shared';
export const sharedFilePath = (hash: string): string => `${SHARED_DIR}/${hash}.datauri`;
export const SHARED_REF = /\/_shared\/([0-9a-f]{16})\b/g;

/** The shared files a page points at, by hash, so they can be kept with it and served beside it. */
export const sharedFilesOf = (html: string): string[] => [...new Set([...html.matchAll(SHARED_REF)].map((m) => m[1] as string))];
