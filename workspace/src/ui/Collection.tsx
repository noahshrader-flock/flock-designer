import { createContext, type ReactNode, useContext } from 'react';
import { Card } from './Card';
import { Row } from './Row';
import { Thumbnail } from './Thumbnail';

/** How things are shown: as cards in a grid, or as rows in a list. */
export type View = 'list' | 'grid';

const Shown = createContext<View>('list');

/**
 * Things shown the way the person chose (`view`, Grid or List, from the view's options): their items (`CollectionItem`) as
 * cards in a grid, or as rows in a list, named for assistive technology. The role is said outright: a list drawn without its
 * bullets is otherwise not always read as one.
 */
export const Collection = ({ view, label, children }: { view: View; label: string; children: ReactNode }) => (
	<Shown.Provider value={view}>
		<ul role="list" aria-label={label} className={view}>
			{children}
		</ul>
	</Shown.Provider>
);

/**
 * One thing in a collection: a card in a grid (`Card`), a row in a list (`Row`), with the same picture (`picture`, its place
 * kept until there is one), name, line, badge and actions in each one's shape.
 */
export const CollectionItem = ({
	picture,
	badge,
	...parts
}: {
	picture: { src: string | undefined; loading: boolean };
	badge?: ReactNode;
	name: string;
	meta?: string;
	onOpen?: () => void;
	current?: boolean;
	context?: Record<string, unknown>;
	actions?: ReactNode;
}) => {
	const thumbnail = (className: string) => <Thumbnail src={picture.src} loading={picture.loading} className={className} />;
	return useContext(Shown) === 'grid' ? (
		<Card {...parts} picture={thumbnail('card-picture')} badge={badge} />
	) : (
		<Row {...parts} start={thumbnail('picture')} end={badge} />
	);
};
