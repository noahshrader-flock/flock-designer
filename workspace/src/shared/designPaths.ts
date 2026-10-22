import { isVersionName } from './versionNames';
import { assertCover } from './validate';

/**
 * A prototype has no git branch; its key where a branch name goes is `prototype/<prototype-id>/<name>`, which no
 * repository's branch pattern makes, so it is never mistaken for one.
 */
const PROTOTYPE_PREFIX = 'prototype/';

export const isPrototypeKey = (branch: string): boolean => branch.startsWith(PROTOTYPE_PREFIX);

export const prototypeKey = (prototypeId: string, name: string): string => `${PROTOTYPE_PREFIX}${prototypeId}/${name}`;

/** The design repository's folder of prototypes: each in a folder of its own, by its id. */
export const PROTOTYPES_DIR = 'prototypes';

export const prototypeDir = (prototypeId: string): string => `${PROTOTYPES_DIR}/${prototypeId}`;

export const prototypePath = (prototypeId: string, file: string): string => `${prototypeDir(prototypeId)}/${file}`;

/** The prototype a path of the design repository is in, if it is in one. */
export const prototypeIdOf = (path: string): string | null => {
	const [dir, id, ...rest] = path.split('/');
	return dir === PROTOTYPES_DIR && id && rest.length > 0 ? id : null;
};

/** The version whose page a path of the design repository is, if it is one. */
export const versionPageOf = (path: string): { prototypeId: string; name: string } | null => {
	const [dir, id, file, ...more] = path.split('/');
	const name = file?.endsWith('.html') ? file.slice(0, -'.html'.length) : '';
	return dir === PROTOTYPES_DIR && id && more.length === 0 && isVersionName(name) ? { prototypeId: id, name } : null;
};

export const WORK_FILE = 'work.json';
export const workPath = (prototypeId: string): string => prototypePath(prototypeId, WORK_FILE);

/** What was asked for a version, in order: one file for each, as a version's page is. */
export const requestsPath = (prototypeId: string, name: string): string => prototypePath(prototypeId, `requests-${name}.md`);

export const prototypePagePath = (prototypeId: string, name: string): string => prototypePath(prototypeId, `${name}.html`);

export const prototypeSourcePath = (prototypeId: string, name: string): string => prototypePath(prototypeId, `${name}.tsx`);

/** `name` null: the product's own app (`dsnr accessibility`). */
export const accessibilityPath = (prototypeId: string, name: string | null): string => `${accessibilityEvidenceDir(prototypeId, name)}.json`;

export const accessibilityLedgerPath = (prototypeId: string, name: string | null): string =>
	`${accessibilityEvidenceDir(prototypeId, name)}.ledger.json`;

export const accessibilityEvidenceDir = (prototypeId: string, name: string | null): string =>
	prototypePath(prototypeId, `accessibility/${name ?? 'app'}`);

/** Made unique among the measure's views (`home`, `home-2`), so two never share one, whatever script the names are in. */
export const accessibilityViewDirs = (prototypeId: string, name: string | null, views: string[]): Map<string, string> => {
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
			return [view, `${accessibilityEvidenceDir(prototypeId, name)}/${folder}`];
		}),
	);
};

export const accessibilityReturnedPath = (prototypeId: string): string => prototypePath(prototypeId, 'accessibility/returned.md');
export const accessibilityReturnedRecordPath = (prototypeId: string): string => prototypePath(prototypeId, 'accessibility/returned.json');
export const accessibilityGuardsPath = (prototypeId: string): string => prototypePath(prototypeId, 'accessibility/guards.md');

/**
 * In a folder of its own, so a picture is never one of the prototype's documents, and named by the page's hash, so a file
 * never changes under its name.
 */
export const coverPath = (prototypeId: string, name: string, cover: string): string => {
	assertCover(cover);
	return prototypePath(prototypeId, `covers/${name}-${cover}.jpg`);
};

/** Where the site puts its prototypes, so a link says what it leads to: `prototype/<id>/<version>/`. */
export const SITE_PROTOTYPES = 'prototype';

/** From the site's root. */
export const sitePath = (prototypeId: string, name: string): string | null =>
	isVersionName(name) ? `${SITE_PROTOTYPES}/${prototypeId}/${name}/` : null;

/** Large files pages share (fonts, mostly), kept once as the data they were embedded as, named by their content's hash. */
export const SHARED_DIR = `${PROTOTYPES_DIR}/_shared`;
export const sharedFilePath = (hash: string): string => `${SHARED_DIR}/${hash}.datauri`;
export const SHARED_REF = /\/_shared\/([0-9a-f]{16})\b/g;

export const sharedFilesOf = (html: string): string[] => [...new Set([...html.matchAll(SHARED_REF)].map((m) => m[1] as string))];
