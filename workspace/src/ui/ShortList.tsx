import type { ReactNode } from 'react';
import { Disclosure } from './Section';
import { ValueList } from './ValueItem';

const MOST_LISTED = 8;

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
