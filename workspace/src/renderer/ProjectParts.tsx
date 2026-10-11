import { MessageSquareIcon } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import type { Project, ProjectIteration } from '../shared/contract';
import { plural } from '../shared/plural';
import { byVersion, coverToShow, projectOpening, workOf } from '../shared/projects';
import { CARD_DETAIL } from './cardFooters';

/**
 * What a project's card and its row in the list have in common, so neither says it twice: its picture, what it has (its
 * versions and comments), and what pressing it does.
 */

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
		let live = true;
		void window.workspace.projectCover(project.id, shown.name, shown.cover).then((r) => {
			const picture = r.ok ? r.value : null;
			if (picture !== null) read.set(key, picture);
			if (live) setAnswer({ key, picture });
		});
		return () => {
			live = false;
		};
		// Asked again only when the picture is another: the key is the project, its prototype and the hash.
	}, [key]); // eslint-disable-line react-hooks/exhaustive-deps
	if (key === null) return { picture: undefined, waiting: false };
	const known = read.get(key) ?? (answer?.key === key ? answer.picture : undefined);
	return { picture: known ?? undefined, waiting: known === undefined };
};

/** How many comments a project's prototypes have, all of them together. */
const commentsOn = (prototypes: ProjectIteration[]): number => prototypes.reduce((n, it) => n + it.openComments, 0);

/** What a card's footer and a row say at their right, in the gray of the details. */
const Aside = ({ children }: { children: ReactNode }) => <span className={`${CARD_DETAIL} flex shrink-0 items-center gap-1.5`}>{children}</span>;

/**
 * What a project has, at the right: how many versions and how many comments its prototypes have; or Built in code; or
 * Nothing made yet. Versions are different ideas, not the iterations in each (V1 · I1 and V1 · I2 are one version).
 */
export const ProjectAside = ({ project }: { project: Project }) => {
	const prototypes = workOf(project.iterations, 'prototype');
	if (prototypes.length > 0) {
		const comments = commentsOn(prototypes);
		return (
			<Aside>
				<span>{plural(byVersion(prototypes).length, 'version')}</span>
				<span aria-hidden>•</span>
				<span className="flex items-center gap-1" aria-label={plural(comments, 'comment')}>
					<MessageSquareIcon className="size-3.5" />
					{comments}
				</span>
			</Aside>
		);
	}
	return <Aside>{workOf(project.iterations, 'codebase').length > 0 ? 'Built in code' : 'Nothing made yet'}</Aside>;
};

/**
 * What pressing a project does (`projectOpening`), ready to press: its words for a screen reader, whether it is a button
 * (into the app) or a link (out to GitHub), and the press. Null when there is nothing to open.
 */
export const openingOf = (project: Project, onOpen: (iteration: ProjectIteration) => void) => {
	const opening = projectOpening(project);
	if (opening === null) return null;
	return {
		label: opening.label,
		role: opening.kind === 'app' ? ('button' as const) : ('link' as const),
		press: opening.kind === 'app' ? () => onOpen(opening.iteration) : () => void window.open(opening.url, '_blank', 'noreferrer'),
	};
};
