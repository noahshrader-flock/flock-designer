import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { coverPath, prototypePagePath, prototypeSourcePath, WORK_FILE } from '../src/shared/designPaths';
import { isPrototypeName } from '../src/shared/prototypeNames';
import { parseWork } from '../src/shared/workRecords';

/**
 * The projects this repository holds, as the design repository (VERSIONS_PLAN Phase 1): read, never written. Each opens with
 * the record DSNR reads now, its versions by one number, and the files a version is known by, so a project in an old shape
 * is found here and not by a person whose project has stopped opening.
 */
const design = join(__dirname, '..', '..');
const projects = readdirSync(join(design, 'projects'), { withFileTypes: true })
	.filter((e) => e.isDirectory() && !e.name.startsWith('_'))
	.map((e) => e.name);

describe.each(projects)('the project %s, as it is in this repository', (id) => {
	const at = (path: string) => join(design, path);
	const records = parseWork(readFileSync(at(`projects/${id}/${WORK_FILE}`), 'utf8'));

	it('has its records in the one file DSNR reads, and none in the old one', () => {
		expect(records).not.toBeNull();
		expect(existsSync(at(`projects/${id}/iterations.json`))).toBe(false);
	});

	it('has each version, named by one number, keyed by its name, with its page, its source and its picture', () => {
		for (const r of (records ?? []).filter((x) => x.name !== 'codebase')) {
			expect(isPrototypeName(r.name)).toBe(true);
			expect(r.branch).toBe(`prototype/${id}/${r.name}`);
			expect(existsSync(at(prototypePagePath(id, r.name))), r.name).toBe(true);
			expect(existsSync(at(prototypeSourcePath(id, r.name))), r.name).toBe(true);
			if (r.cover) expect(existsSync(at(coverPath(id, r.name, r.cover))), r.name).toBe(true);
		}
	});

	it('keeps no file under a name in the old shape', () => {
		const files = readdirSync(at(`projects/${id}`), { recursive: true, encoding: 'utf8' });
		expect(files.filter((f) => /(^|\/)(audit-)?(v\d+-)?i\d+[.-]/.test(f))).toEqual([]);
	});
});
