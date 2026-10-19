import { useState } from 'react';
import { groupsFound } from '../../src/shared/catalog';
import type { CatalogComponent, ComponentPictures } from '../../src/shared/contract';
import type { ComponentLink } from '../src/messages';
import { type MenuItem, Menu } from '../../src/ui/Menu';
import { SearchBox } from '../../src/ui/SearchBox';
import { Section } from '../../src/ui/Section';
import { ViewOptions } from '../../src/ui/ViewOptions';
import { NoMatches } from '../../src/ui/NoMatches';
import { layoutSection } from './layouts';
import { modeSection } from './mode';
import { useMode, useShared } from './shared';
import type { View } from '../../src/ui/Collection';
import { Collection, CollectionItem } from '../../src/ui/Collection';
import { asks } from './host';

export const ComponentsView = ({
	components,
	pictures,
	view,
	onView,
	hasDark,
}: {
	components: CatalogComponent[];
	pictures: ComponentPictures;
	view: View;
	onView: (view: View) => void;
	hasDark: boolean;
}) => {
	const [search, setSearch] = useState('');
	const groups = groupsFound(components, search);
	const { components: open } = useShared('tabs');
	const [mode, setMode] = useMode();
	const item = (c: CatalogComponent) => {
		const link = (to: ComponentLink) => () => void asks().componentLink(c.id, to);
		const items: MenuItem[] = [
			...(c.storybookPath !== null ? [{ label: 'Open in Storybook', icon: 'book', onSelect: link('storybook') }] : []),
			{ label: 'View on GitHub', icon: 'github', onSelect: link('source') },
		];
		const shared = {
			name: c.name,
			onOpen: () => void asks().openComponent(c.id),
			current: open.includes(c.id),
			actions: <Menu label={`${c.name} actions`} size="small" sections={[{ items }]} />,
		};
		return <CollectionItem key={c.id} {...shared} picture={{ src: pictures.pictures[c.id], loading: pictures.drawing }} />;
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
						<Collection view={view} label={group}>
							{inGroup.map(item)}
						</Collection>
					</Section>
				))
			)}
		</>
	);
};
