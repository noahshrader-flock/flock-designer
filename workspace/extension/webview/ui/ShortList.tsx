import type { ReactNode } from 'react';
import { Disclosure } from './Disclosure';

/** How many of a long list are shown before the rest, which wait behind "Show N more". */
export const MOST_LISTED = 8;

/** A list of rows: the first few, then the rest kept closed until asked for. `row` gives each its own key. */
export const ShortList = <T,>({ items, row }: { items: T[]; row: (item: T) => ReactNode }) => (
	<>
		<ul className="tokens">{items.slice(0, MOST_LISTED).map(row)}</ul>
		{items.length > MOST_LISTED && (
			<Disclosure label={`Show ${items.length - MOST_LISTED} more`}>
				<ul className="tokens">{items.slice(MOST_LISTED).map(row)}</ul>
			</Disclosure>
		)}
	</>
);
