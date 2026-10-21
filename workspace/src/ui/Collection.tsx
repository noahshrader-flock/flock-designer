import { createContext, type ReactNode, useContext } from 'react';
import { Card } from './Card';
import { Row } from './Row';
import { Thumbnail } from './Thumbnail';

export type View = 'list' | 'grid';

const Shown = createContext<View>('list');

/** The role is said outright: a list drawn without its bullets is otherwise not always read as one. */
export const Collection = ({ view, label, children }: { view: View; label: string; children: ReactNode }) => (
	<Shown.Provider value={view}>
		<ul role="list" aria-label={label} className={view}>
			{children}
		</ul>
	</Shown.Provider>
);

export const CollectionItem = ({
	picture,
	badge,
	...parts
}: {
	picture: { src: string | undefined; loading: boolean };
	badge?: ReactNode;
	name: string;
	meta?: ReactNode;
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
