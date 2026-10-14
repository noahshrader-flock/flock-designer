import { useState } from 'react';
import { summaryOf } from '../../src/shared/accessibility';
import { groupsFound } from '../../src/shared/catalog';
import type { AccessibilityCounts, CatalogComponent, ComponentPictures } from '../../src/shared/contract';
import type { ComponentLink } from '../src/messages';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import { Grid } from './ui/Grid';
import { List } from './ui/List';
import { type MenuItem, Menu } from './ui/Menu';
import { Row } from './ui/Row';
import { SearchBox } from './ui/SearchBox';
import { Section } from './ui/Section';
import { Toggle } from './ui/Toggle';
import { NoMatches } from './ui/NoMatches';
import { LAYOUTS } from './layouts';
import type { View } from './vscode';

/**
 * A component's picture (P5 of the design system plan): its first story, drawn by the browser on this machine; its place
 * kept until there is one, said to be drawing while a pass is.
 */
const Picture = ({ src, drawing, className }: { src: string | undefined; drawing: boolean; className: string }) =>
	src ? (
		<img data-part="picture" alt="" className={className} src={src} />
	) : (
		<span data-part="picture" data-drawing={drawing || undefined} aria-hidden="true" className={className} />
	);

/** How many issues axe found in its stories (T7), as its card says: none is shown as nothing, never as a pass. */
const Issues = ({ issues }: { issues: AccessibilityCounts | undefined }) =>
	issues && issues.violations > 0 ? <Badge count={issues.violations} label={summaryOf(issues)} /> : undefined;

/**
 * The design system's components (6.1): a search and Grid or List, as the projects have, then a section for each group in
 * the order the library lists them (a group with nothing found is left out), each component a card or a row with its
 * picture and what axe found. Pressed, a component opens in its own tab; its menu has its links too.
 */
export const ComponentsView = ({
	components,
	pictures,
	view,
	onView,
	onOpen,
	onLink,
}: {
	components: CatalogComponent[];
	pictures: ComponentPictures;
	view: View;
	onView: (view: View) => void;
	onOpen: (id: string) => void;
	onLink: (id: string, link: ComponentLink) => void;
}) => {
	const [search, setSearch] = useState('');
	const groups = groupsFound(components, search);
	const item = (c: CatalogComponent) => {
		const items: MenuItem[] = [
			{ label: 'Open', icon: 'preview', onSelect: () => onOpen(c.id) },
			...(c.storybook !== null ? [{ label: 'Open in Storybook', icon: 'book', onSelect: () => onLink(c.id, 'storybook') }] : []),
			{ label: 'Source on GitHub', icon: 'github', onSelect: () => onLink(c.id, 'source') },
		];
		const shared = {
			name: c.name,
			meta: c.subtitle ?? c.group,
			onOpen: () => onOpen(c.id),
			actions: <Menu label={`${c.name} actions`} sections={[{ items }]} />,
		};
		const picture = pictures.pictures[c.id];
		return view === 'grid' ? (
			<Card
				key={c.id}
				{...shared}
				picture={<Picture src={picture} drawing={pictures.drawing} className="card-picture" />}
				badge={<Issues issues={pictures.issues[c.id]} />}
			/>
		) : (
			<Row
				key={c.id}
				{...shared}
				start={<Picture src={picture} drawing={pictures.drawing} className="picture" />}
				end={<Issues issues={pictures.issues[c.id]} />}
			/>
		);
	};
	return (
		<>
			<div className="view-bar">
				<SearchBox label="Search components" value={search} onChange={setSearch} />
				<Toggle label="Layout" options={LAYOUTS} value={view} onChange={onView} iconOnly />
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
