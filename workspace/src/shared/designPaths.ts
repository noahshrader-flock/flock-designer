import { parsePrototypeName } from './prototypeNames';
import { assertCover } from './validate';

/** Where things are in the design repository, and the keys prototypes are known by. */

/**
 * A prototype: one self-contained page, made without running the product, saved in the design repository beside
 * the project's other records. It has no git branch. Its key, in the place a branch name goes (the iteration
 * record, the review thread), is `prototype/<project-id>/<name>`, which no repository's branch pattern makes, so it
 * can never be mistaken for one. (The older prototypes on `fd/` branches have a branch, not a key.)
 */
const PROTOTYPE_PREFIX = 'prototype/';

export const isPrototypeKey = (branch: string): boolean => branch.startsWith(PROTOTYPE_PREFIX);

export const prototypeKey = (projectId: string, name: string): string => `${PROTOTYPE_PREFIX}${projectId}/${name}`;

/** A project's folder in the design repository: the one place a project's path is built (the folders plan's rule 3). */
export const projectDir = (projectId: string): string => `projects/${projectId}`;

/** A file in a project's folder in the design repository, by its path from the repository's root. */
export const projectPath = (projectId: string, file: string): string => `${projectDir(projectId)}/${file}`;

/** Where a prototype's page is kept in the design repository. */
export const prototypePagePath = (projectId: string, name: string): string => projectPath(projectId, `prototypes/${name}.html`);

/** Its React source, kept beside the page. */
export const prototypeSourcePath = (projectId: string, name: string): string => projectPath(projectId, `prototypes/${name}.tsx`);

/**
 * Where a project's accessibility measure is kept in the design repository, as evidence: of a prototype's page, by its
 * name, or, with none, of the product's own app (`dsnr accessibility`, decision 2 of the accessibility plan).
 */
export const accessibilityPath = (projectId: string, name: string | null): string => projectPath(projectId, `accessibility/${name ?? 'app'}.json`);

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
 * Where an iteration is on the published site, from the site's root: `<project>/v1/i2/`. The one place the site's
 * addresses are made, for the site itself, the command that publishes it and the app that opens it. Null for a name
 * that is not a prototype's.
 */
export const sitePath = (projectId: string, name: string): string | null => {
	const p = parsePrototypeName(name);
	return p ? `${projectId}/v${p.version}/i${p.iteration}/` : null;
};

/**
 * The large files pages share (fonts, mostly), kept once in the design repository as the data they were embedded as, each
 * named by its content's hash; a page names one as `/_shared/<hash>` (`SHARED_REF`), and every reader finds them by these.
 */
export const SHARED_DIR = 'projects/_shared';
export const sharedFilePath = (hash: string): string => `${SHARED_DIR}/${hash}.datauri`;
export const SHARED_REF = /\/_shared\/([0-9a-f]{16})\b/g;

/** The shared files a page points at, by hash, so they can be kept with it and served beside it. */
export const sharedFilesOf = (html: string): string[] => [...new Set([...html.matchAll(SHARED_REF)].map((m) => m[1] as string))];
