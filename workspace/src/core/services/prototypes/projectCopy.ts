import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	PROTOTYPES_DIR,
	SHARED_DIR,
	projectPath,
	prototypePagePath,
	sharedFilePath,
	sharedFilesOf,
	WORK_FILE,
	workPath,
} from '../../../shared/designPaths';
import { parseWork } from '../../../shared/workRecords';
import { isVersionName } from '../../../shared/versionNames';
import { PROJECT_ID } from '../../../shared/validate';
import type { RepoFiles } from '../../../codeHost/repoFiles';

/**
 * Laid out as a checkout's `prototypes/<id>/` is, so its review can be built with no checkout. Other projects' copies are
 * removed unless in `keep`, and shared files unless a kept page names them. Returns the `prototypes` folder.
 */
export const copyProject = async (files: Pick<RepoFiles, 'readFile'>, id: string, into: string, keep: string[] = []): Promise<string> => {
	if (!PROJECT_ID.test(id)) throw new Error(`${id.slice(0, 80)} is not a project.`);
	const projects = join(into, PROTOTYPES_DIR);
	const text = await files.readFile(workPath(id));
	const records = text === null ? null : parseWork(text);
	if (records === null || records.length === 0) throw new Error(`${id} has no prototypes on GitHub to review.`);
	const brief = await files.readFile(projectPath(id, 'brief.md'));
	// Only the versions: codebase work has no page, so nothing is read or written for it.
	const names = [...new Set(records.map((r) => r.name).filter(isVersionName))];
	const pages = await Promise.all(names.map(async (name) => [name, await files.readFile(prototypePagePath(id, name))] as const));
	const hashes = [...new Set(pages.flatMap(([, html]) => sharedFilesOf(html ?? '')))];
	const shared = await Promise.all(hashes.map(async (hash) => [hash, await files.readFile(sharedFilePath(hash))] as const));

	// Written whole once everything is read: the project as it is now, with nothing left of how it was.
	const dir = join(into, projectPath(id, ''));
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, WORK_FILE), text as string);
	if (brief !== null) writeFileSync(join(dir, 'brief.md'), brief);
	for (const [name, html] of pages) if (html !== null) writeFileSync(join(into, prototypePagePath(id, name)), html);
	mkdirSync(join(into, SHARED_DIR), { recursive: true });
	for (const [hash, uri] of shared) if (uri !== null) writeFileSync(join(into, sharedFilePath(hash)), uri);
	forgetUnused(into, [id, ...keep]);
	return projects;
};

const forgetUnused = (into: string, kept: string[]): void => {
	const projects = join(into, PROTOTYPES_DIR);
	const ours = readdirSync(projects, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== '_shared');
	for (const e of ours) if (!kept.includes(e.name)) rmSync(join(projects, e.name), { recursive: true, force: true });
	const named = new Set(
		ours
			.filter((e) => kept.includes(e.name))
			.flatMap((e) => {
				// Each version's page, beside the prototype's records.
				const dir = join(projects, e.name);
				const pages = readdirSync(dir).filter((f) => f.endsWith('.html') && isVersionName(f.slice(0, -'.html'.length)));
				return pages.flatMap((f) => sharedFilesOf(readFileSync(join(dir, f), 'utf8')));
			}),
	);
	for (const f of readdirSync(join(into, SHARED_DIR)))
		if (!named.has(f.replace(/\.datauri$/, ''))) rmSync(join(into, SHARED_DIR, f), { force: true });
};
