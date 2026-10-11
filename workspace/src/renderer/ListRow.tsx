import { ChevronRightIcon, ExternalLinkIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { PICTURE_SHAPE, PictureArea } from './PictureArea';

/** What a row's picture is, reduced: the card's picture in the same shape, 40 pixels high. Rows still loading take the same. */
export const THUMBNAIL = `h-10 shrink-0 ${PICTURE_SHAPE}`;
/** How a row is laid out, the picture then the words: the row, and the row still loading (`RowsSkeleton`). */
export const ROW_LAYOUT = 'flex items-center gap-4 px-4 py-3';

/**
 * Rows in one box with a line between them: the list view of what a grid shows as cards, the same for components and for
 * projects, and the box a list is drawn in while it loads (`RowsSkeleton`). Its children are `ListRow`s.
 */
export const RowList = ({ children }: { children: ReactNode }) => <ul className="bg-card divide-y rounded-lg border">{children}</ul>;

/**
 * One row, the list view of a card: its picture reduced at the left (a thumbnail), the name with a line under it when
 * there is one, what the row has at the right (`aside`), and a mark that it opens. The whole row is the button, in an `li`
 * that carries the `data-` attributes it is given (`data`), which say what the row is.
 *
 * `onOpen` is null for a row with nothing to open: the button is off, with no mark, and the row is there all the same.
 * `external` marks that opening leaves the app, as the card's icon does. `label` names what opening does, for a screen
 * reader, when the row's own words do not.
 */
export const ListRow = ({
	data,
	name,
	detail,
	aside,
	picture,
	drawing,
	onOpen,
	label,
	external = false,
}: {
	data?: Record<`data-${string}`, string>;
	name: ReactNode;
	detail?: ReactNode;
	aside?: ReactNode;
	picture: string | undefined;
	drawing: boolean;
	onOpen: (() => void) | null;
	label?: string;
	external?: boolean;
}) => {
	const Mark = external ? ExternalLinkIcon : ChevronRightIcon;
	return (
		<li {...data}>
			<button
				type="button"
				aria-label={label}
				disabled={onOpen === null}
				className={`${ROW_LAYOUT} w-full text-left ${onOpen === null ? '' : 'hover:bg-muted/50'}`}
				onClick={onOpen ?? undefined}
			>
				<span data-thumbnail className={`relative overflow-hidden rounded-md border ${THUMBNAIL}`}>
					<PictureArea picture={picture} drawing={drawing} />
				</span>
				<span className="flex min-w-0 grow flex-col gap-0.5">
					<span className="min-w-0 text-sm font-medium">{name}</span>
					{detail}
				</span>
				{aside}
				{onOpen !== null && <Mark aria-hidden className="text-muted-foreground size-4 shrink-0" />}
			</button>
		</li>
	);
};
