import { useEffect, useState } from 'react';
import type { Project } from '../../../src/shared/contract';
import { coverToShow } from '../../../src/shared/projectList';
import { workspace } from '../host';
import { askOnce } from './ask';

/** Pictures already read, by what names them: what a picture's name names never changes, so one shown again has it at once. */
const read = new Map<string, string>();

/**
 * The picture of a project: its newest prototype's, else the newest earlier one that has one (`coverToShow`), read by the
 * name its record gives it. `waiting` while it is being read; no picture when there is none, or it cannot be read.
 */
export const useCover = (project: Project): { picture: string | undefined; waiting: boolean } => {
	const shown = coverToShow(project);
	const key = shown === null ? null : `${project.id}/${shown.name}/${shown.cover}`;
	const [answer, setAnswer] = useState<{ key: string; picture: string | null } | null>(null);
	useEffect(() => {
		if (shown === null || key === null || read.has(key)) return;
		return askOnce(
			() => workspace().projectCover(project.id, shown.name, shown.cover),
			(r) => {
				const picture = r.ok ? r.value : null;
				if (picture !== null) read.set(key, picture);
				setAnswer({ key, picture });
			},
		);
		// Asked again only when the picture is another: the key is the project, its prototype and the hash.
	}, [key]); // eslint-disable-line react-hooks/exhaustive-deps
	if (key === null) return { picture: undefined, waiting: false };
	const known = read.get(key) ?? (answer?.key === key ? answer.picture : undefined);
	return { picture: known ?? undefined, waiting: known === undefined };
};
