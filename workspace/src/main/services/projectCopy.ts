import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseIterations } from '../../shared/iterationRecords';
import { isPrototypeName } from '../../shared/prototypeNames';
import { PROJECT_ID } from '../../shared/validate';
import type { RepoFiles } from '../../host/repoFiles';

/** A page's shared files, by the hash it names them with (`/_shared/<hash>`), as the site relinks them. */
const SHARED = /\/_shared\/([0-9a-f]{16})\b/g;

/**
 * One project of the design repository, read through GitHub into `into`, laid out as a checkout is (`flock-designer/
 * projects/<id>/`), so its review can be built on a machine with no checkout of it (PROJECT_SCOPE_PLAN 3.2): its brief,
 * its records, the pages they name, and the shared files those pages use, nothing else. Read again each time, so it is
 * the project as GitHub has it now. Returns where its records are, as a checkout's would be (the `projects` folder).
 */
export const copyProject = async (files: Pick<RepoFiles, 'readFile'>, id: string, into: string): Promise<string> => {
	if (!PROJECT_ID.test(id)) throw new Error(`${id.slice(0, 80)} is not a project.`);
	const projects = join(into, 'flock-designer', 'projects');
	const dir = join(projects, id);
	const text = await files.readFile(`projects/${id}/iterations.json`);
	const records = text === null ? null : parseIterations(text);
	if (records === null || records.length === 0) throw new Error(`${id} has no prototypes on GitHub to review.`);
	const brief = await files.readFile(`projects/${id}/brief.md`);
	// Only prototypes' names: a record naming anything else is read for nothing, and nothing is written for it.
	const names = [...new Set(records.map((r) => r.name).filter(isPrototypeName))];
	const pages = await Promise.all(names.map(async (name) => [name, await files.readFile(`projects/${id}/prototypes/${name}.html`)] as const));
	const hashes = [...new Set(pages.flatMap(([, html]) => [...(html ?? '').matchAll(SHARED)].map((m) => m[1] as string)))];
	const shared = await Promise.all(hashes.map(async (hash) => [hash, await files.readFile(`projects/_shared/${hash}.datauri`)] as const));

	// Written whole once everything is read: the project as it is now, with nothing left of how it was.
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(join(dir, 'prototypes'), { recursive: true });
	writeFileSync(join(dir, 'iterations.json'), text as string);
	if (brief !== null) writeFileSync(join(dir, 'brief.md'), brief);
	for (const [name, html] of pages) if (html !== null) writeFileSync(join(dir, 'prototypes', `${name}.html`), html);
	if (shared.some(([, uri]) => uri !== null)) mkdirSync(join(projects, '_shared'), { recursive: true });
	for (const [hash, uri] of shared) if (uri !== null) writeFileSync(join(projects, '_shared', `${hash}.datauri`), uri);
	return projects;
};
