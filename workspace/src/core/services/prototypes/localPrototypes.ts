import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Prototype } from '../../../shared/contract';
import { mergePeople } from '../../../shared/people';
import { fromBrief } from '../../../shared/brief';
import { workOrder } from '../../../shared/prototypeList';
import { toPrototypeWork } from '../../../shared/workRecords';
import { workInFolder } from './workRecords';
import { pendingHere } from './pendingPrototypes';

/** Unreadable pieces are skipped, so a half-written record cannot hide every other prototype. */
export const readFolderPrototypes = (recordsRoot: string): Prototype[] => {
	if (!existsSync(recordsRoot)) return [];
	return readdirSync(recordsRoot, { withFileTypes: true })
		.filter((e) => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('.'))
		.map((e): Prototype => {
			const dir = join(recordsRoot, e.name);
			const records = readdirSync(dir, { withFileTypes: true })
				.filter((f) => f.isFile())
				.map((f) => f.name)
				.sort();
			const brief = records.includes('brief.md') ? readFileSync(join(dir, 'brief.md'), 'utf8') : null;
			const work = (workInFolder(dir) ?? []).map((it) => toPrototypeWork(it)).sort(workOrder);
			return {
				id: e.name,
				...fromBrief(e.name, brief),
				records,
				work,
				people: mergePeople(...work.map((i) => i.contributors)),
			};
		});
};

/** With each version started here and not saved yet, marked, as what it will be once it is. */
export const withStartedHere = (folders: Prototype[], prototypesRoot: string): Prototype[] => {
	const byId = new Map(folders.map((p) => [p.id, p]));
	for (const r of pendingHere(prototypesRoot)) {
		const p = byId.get(r.prototypeId) ?? { id: r.prototypeId, title: r.prototypeId, folder: null, records: [], work: [], people: [] };
		if (p.work.some((w) => w.name === r.name)) continue;
		const started = { ...toPrototypeWork(r), building: true };
		byId.set(p.id, { ...p, work: [...p.work, started].sort(workOrder), people: mergePeople(p.people, started.contributors) });
	}
	return [...byId.values()];
};
