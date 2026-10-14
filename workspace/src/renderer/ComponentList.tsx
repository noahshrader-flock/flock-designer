import { groupsFound } from '../shared/catalog';
import type { CatalogComponent } from '../shared/contract';
import { CardGrid } from './CardGrid';
import { ComponentCard } from './ComponentCard';
import { GroupTrigger, type useClosedGroups } from './GroupAccordion';
import { ListRow, RowList } from './ListRow';
import { NoMatches } from './NoMatches';
import type { useComponentPictures } from './useComponentPictures';
import type { View } from './ViewSwitcher';
import { Accordion, AccordionContent, AccordionItem } from './ui/accordion';

/**
 * A component in the list: its picture reduced at the left (a thumbnail, the grid's picture in the same shape), then its name
 * and description. The whole row opens it, and the chevron says so. Its links are on its own page.
 */
const Row = ({
	component,
	picture,
	drawing,
	onOpen,
}: {
	component: CatalogComponent;
	picture: string | undefined;
	drawing: boolean;
	onOpen: () => void;
}) => (
	<ListRow
		data={{ 'data-component': component.id }}
		name={component.name}
		detail={component.subtitle && <span className="text-muted-foreground text-sm">{component.subtitle}</span>}
		picture={picture}
		drawing={drawing}
		onOpen={onOpen}
	/>
);

/**
 * The design system's components, as the search finds them, in groups as the catalog has them (a group with nothing
 * found is left out), each a row or a card as the view chosen says, with its picture. Groups closed up stay closed while a
 * component is open (`closed`); a search that finds nothing says so, with a way to clear it.
 */
export const ComponentList = ({
	components,
	search,
	onClearSearch,
	view,
	closed,
	pictures,
	onOpen,
}: {
	components: CatalogComponent[];
	search: string;
	onClearSearch: () => void;
	view: View;
	closed: ReturnType<typeof useClosedGroups>;
	pictures: ReturnType<typeof useComponentPictures>;
	onOpen: (id: string) => void;
}) => {
	const groups = groupsFound(components, search);
	if (groups.length === 0) return <NoMatches thing="component" search={search} onClear={onClearSearch} />;
	return (
		<Accordion {...closed.accordion(groups.map((g) => g.group))}>
			{groups.map(({ group, components: rows }) => (
				<AccordionItem key={group} value={group} data-component-group={group}>
					<GroupTrigger name={group} count={rows.length} />
					<AccordionContent>
						{view === 'grid' ? (
							<CardGrid>
								{rows.map((c) => (
									<ComponentCard
										key={c.id}
										component={c}
										picture={pictures.pictures[c.id]}
										drawing={pictures.drawing}
										issues={pictures.issues[c.id]}
										onOpen={() => onOpen(c.id)}
									/>
								))}
							</CardGrid>
						) : (
							<RowList>
								{rows.map((c) => (
									<Row key={c.id} component={c} picture={pictures.pictures[c.id]} drawing={pictures.drawing} onOpen={() => onOpen(c.id)} />
								))}
							</RowList>
						)}
					</AccordionContent>
				</AccordionItem>
			))}
		</Accordion>
	);
};
