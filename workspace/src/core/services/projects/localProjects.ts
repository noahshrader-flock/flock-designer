import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Project } from '../../../shared/contract';
import { mergePeople } from '../../../shared/people';
import { fromBrief } from '../../../shared/brief';
import { workOrder } from '../../../shared/projectList';
import { toProjectWork } from '../../../shared/workRecords';
import { workInFolder } from './workRecords';

/** Unreadable pieces are skipped, so a half-written record cannot hide every other project. */
export const readFolderProjects = (recordsRoot: string): Project[] => {
	if (!existsSync(recordsRoot)) return [];
	return readdirSync(recordsRoot, { withFileTypes: true })
		.filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
		.map((e): Project => {
			const dir = join(recordsRoot, e.name);
			const records = readdirSync(dir, { withFileTypes: true })
				.filter((f) => f.isFile())
				.map((f) => f.name)
				.sort();
			const brief = records.includes('brief.md') ? readFileSync(join(dir, 'brief.md'), 'utf8') : null;
			const work = (workInFolder(dir) ?? []).map((it) => toProjectWork(it)).sort(workOrder);
			return {
				id: e.name,
				...fromBrief(e.name, brief),
				records,
				work,
				people: mergePeople(...work.map((i) => i.contributors)),
			};
		});
};
