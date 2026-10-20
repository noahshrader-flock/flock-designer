import { Menu } from './Menu';

/** One of a few things, chosen from a menu: the button says which; choosing the one already chosen does nothing. */
export const Dropdown = ({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: { value: string; label: string }[];
	onChange: (value: string) => void;
}) => (
	<Menu
		label={label}
		field={(options.find((o) => o.value === value) ?? options[0])?.label ?? ''}
		align="start"
		sections={[
			{
				items: options.map((o) => ({
					label: o.label,
					checked: o.value === value,
					onSelect: () => o.value !== value && onChange(o.value),
				})),
			},
		]}
	/>
);
