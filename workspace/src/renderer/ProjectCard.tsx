import { ExternalLinkIcon } from 'lucide-react';
import type { Project, ProjectIteration } from '../shared/contract';
import { CardCover } from './CardCover';
import { CARD_NAME, PROJECT_FOOTER } from './cardFooters';
import { PictureArea } from './PictureArea';
import { PRESSABLE_CARD, pressableCard } from './pressableCard';
import { PeopleLine } from './People';
import { ProjectAside, openingOf, useCover } from './ProjectParts';
import { Badge } from './ui/badge';
import { Card, CardFooter, CardTitle } from './ui/card';

/**
 * A project in the Projects grid, shaped as a component's is (`ComponentCard`): the cover is the picture of its newest
 * prototype (`useCover`), in the soft color of a component with no picture until there is one, with whether the project is
 * only on this machine at its top left. The footer has the project's name on a row of its own, and under it who it is by
 * at the left and, at the right in gray, how many versions the project has and how many comments its prototypes have (or
 * Built in code, or Nothing made yet). It is the same height on every card, so a row of cards lines up.
 *
 * **The whole card opens the project at its newest prototype**, which is the app's work: it is for prototypes. A project
 * with only codebase work is not opened here (that work is done in the codebase): its footer says Built in code, and the
 * whole card opens it on GitHub in the browser, for anyone with access, whether or not they have the repository, with
 * the external-link icon at the card's top right to say it leaves the app.
 */
export const ProjectCard = ({ project, onOpen }: { project: Project; onOpen: (iteration: ProjectIteration) => void }) => {
	const cover = useCover(project);
	// What pressing the card does (`openingOf`): into the newest prototype, or out to the codebase work on GitHub. Or nothing.
	const opening = openingOf(project, onOpen);
	const way = opening === null ? {} : pressableCard(opening.label, opening.press, opening.role);
	return (
		<Card className={`pt-0 ${opening ? PRESSABLE_CARD : ''}`} {...way}>
			{/* The picture of its newest prototype: it fills the cover, as a component's does. */}
			<CardCover>
				<PictureArea picture={cover.picture} drawing={cover.waiting} />
				{project.localOnly && (
					<Badge variant="secondary" className="absolute top-2 left-2 z-10">
						Only on this machine
					</Badge>
				)}
				{opening?.role === 'link' && <ExternalLinkIcon aria-hidden className="text-muted-foreground absolute top-2 right-2 z-10 size-4" />}
			</CardCover>
			<CardFooter className={PROJECT_FOOTER}>
				<CardTitle className={CARD_NAME}>{project.title}</CardTitle>
				<div className="flex items-center justify-between gap-2">
					{project.people.length > 0 ? <PeopleLine people={project.people} /> : <span />}
					<ProjectAside project={project} />
				</div>
			</CardFooter>
		</Card>
	);
};
