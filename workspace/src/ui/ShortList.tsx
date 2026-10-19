import type { ReactNode } from 'react';
import { Disclosure } from './Section';
import { ValueList } from './ValueItem';

/** How many of a long list are shown before the rest, which wait behind "Show N more". */
const MOST_LISTED = 8;

/** A list of rows: the first few, then the rest kept closed until asked for. `row` gives each its own key. */
export const ShortList = <T,>({ items, row }: { items: T[]; row: (item: T) => ReactNode }) => (
	<>
		<ValueList>{items.slice(0, MOST_LISTED).map(row)}</ValueList>
		{items.length > MOST_LISTED && (
			<Disclosure label={`Show ${items.length - MOST_LISTED} more`}>
				<ValueList>{items.slice(MOST_LISTED).map(row)}</ValueList>
			</Disclosure>
		)}
	</>
);
