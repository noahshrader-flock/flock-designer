import { useState } from 'react';
import { groupsFound } from '../../src/shared/catalog';
import type { CatalogComponent, ComponentPictures } from '../../src/shared/contract';
import type { ComponentLink } from '../src/messages';
import { Card } from './ui/Card';
import { Grid } from './ui/Grid';
import { List } from './ui/List';
import { type MenuItem, Menu } from './ui/Menu';
import { Row } from './ui/Row';
import { SearchBox } from './ui/SearchBox';
import { Section } from './ui/Section';
import { Thumbnail } from './ui/Thumbnail';
import { ViewOptions } from './ui/ViewOptions';
import { NoMatches } from './ui/NoMatches';
import { layoutSection } from './layouts';
import { modeSection } from './mode';
import { useMode, useShared } from './shared';
import type { View } from './vscode';

/**
 * The design system's components (6.1): a search and Grid or List, as the projects have, then a section for each group in
 * the order the library lists them (a group with nothing found is left out), each component a card or a row with its
 * picture. Pressed, a component opens in its own tab; its menu has its links (Storybook, when it has one, and its source).
 */
export const ComponentsView = ({
	components,
	pictures,
	view,
	onView,
	hasDark,
	onOpen,
	onLink,
}: {
	components: CatalogComponent[];
	pictures: ComponentPictures;
	view: View;
	onView: (view: View) => void;
	/** Whether the design system has a dark mode, which is offered only then. */
	hasDark: boolean;
	onOpen: (id: string) => void;
	onLink: (id: string, link: ComponentLink) => void;
}) => {
	const [search, setSearch] = useState('');
	const groups = groupsFound(components, search);
	const { components: open } = useShared('tabs');
	const [mode, setMode] = useMode();
	const item = (c: CatalogComponent) => {
		const items: MenuItem[] = [
			...(c.storybook !== null ? [{ label: 'Open in Storybook', icon: 'book', onSelect: () => onLink(c.id, 'storybook') }] : []),
			{ label: 'View on GitHub', icon: 'github', onSelect: () => onLink(c.id, 'source') },
		];
		const shared = {
			name: c.name,
			onOpen: () => onOpen(c.id),
			current: open.includes(c.id),
			actions: <Menu label={`${c.name} actions`} size="small" sections={[{ items }]} />,
		};
		const picture = pictures.pictures[c.id];
		return view === 'grid' ? (
			<Card key={c.id} {...shared} picture={<Thumbnail src={picture} loading={pictures.drawing} className="card-picture" />} />
		) : (
			<Row key={c.id} {...shared} start={<Thumbnail src={picture} loading={pictures.drawing} className="picture" />} />
		);
	};
	return (
		<>
			<div className="view-bar">
				<SearchBox label="Search components" value={search} onChange={setSearch} />
				<ViewOptions sections={[layoutSection(view, onView), ...(hasDark ? [modeSection(mode, setMode)] : [])]} />
			</div>
			{groups.length === 0 ? (
				<NoMatches thing="component" search={search} onClear={() => setSearch('')} />
			) : (
				groups.map(({ group, components: inGroup }) => (
					<Section key={group} title={group} count={inGroup.length}>
						{view === 'grid' ? <Grid label={group}>{inGroup.map(item)}</Grid> : <List label={group}>{inGroup.map(item)}</List>}
					</Section>
				))
			)}
		</>
	);
};
