import { useState } from 'react';
import { AccordionTrigger } from './ui/accordion';

/**
 * What every list of groups in the app shares (the Design System's components, the tokens panel's tokens): each group is an
 * accordion item, **open until it is closed**, so a group that arrives, or a search finds, is open too.
 *
 * Which are closed is kept by name here, and the Accordion's props for the groups being shown come from `accordion(names)`.
 * `reopen` opens them all again, for a list that is now another's.
 */
export const useClosedGroups = () => {
	const [closed, setClosed] = useState<string[]>([]);
	return {
		accordion: (names: string[]) => ({
			type: 'multiple' as const,
			value: names.filter((n) => !closed.includes(n)),
			onValueChange: (open: string[]) => setClosed(names.filter((n) => !open.includes(n))),
		}),
		reopen: () => setClosed([]),
	};
};

/** A group's header: its name, and in gray how many it holds. The same on every list of groups. */
export const GroupTrigger = ({ name, count }: { name: string; count: number }) => (
	<AccordionTrigger>
		<span className="flex items-baseline gap-2">
			<span data-name>{name}</span>
			<span data-count className="text-muted-foreground font-normal">
				{count}
			</span>
		</span>
	</AccordionTrigger>
);
