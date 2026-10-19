import type { KeyboardEvent } from 'react';
import { Icon } from './Icon';

export const SearchBox = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
	<span className="search">
		<Icon name="search" />
		<input
			className="input search-input"
			type="text"
			aria-label={label}
			placeholder={label}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			onKeyDown={(e: KeyboardEvent) => {
				if (e.key === 'Escape' && value !== '') {
					e.preventDefault();
					onChange('');
				}
			}}
		/>
	</span>
);
