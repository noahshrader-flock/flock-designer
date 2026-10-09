import { SearchIcon } from 'lucide-react';
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group';

/**
 * A search box: shadcn's input group with the search icon at its start, and Escape to clear it. The same wherever the
 * app searches (the Projects toolbar, the tokens panel), so they look and behave alike.
 */
export const SearchField = ({
	label,
	value,
	onChange,
	className,
}: {
	/** Its name for assistive technology, and what it says while empty: "Search projects". */
	label: string;
	value: string;
	onChange: (value: string) => void;
	className?: string;
}) => (
	<InputGroup className={className}>
		<InputGroupAddon>
			<SearchIcon />
		</InputGroupAddon>
		<InputGroupInput
			type="search"
			aria-label={label}
			placeholder={label}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			onKeyDown={(e) => e.key === 'Escape' && onChange('')}
		/>
	</InputGroup>
);
