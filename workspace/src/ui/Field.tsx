import { type ChangeEvent, type KeyboardEvent, type ReactNode, useId } from 'react';
import { Icon } from './Icon';

interface FieldControl {
	id: string;
	'aria-describedby'?: string;
	'aria-label'?: string;
}

export const Field = ({ label, hint, children }: { label: string; hint?: string; children: (control: FieldControl) => ReactNode }) => {
	const id = useId();
	const hintId = `${id}-hint`;
	return (
		<div className="field">
			<label htmlFor={id} data-part="label" className="field-label">
				{label}
			</label>
			{children({ id, ...(hint ? { 'aria-describedby': hintId } : {}) })}
			{hint && (
				<span id={hintId} className="field-hint">
					{hint}
				</span>
			)}
		</div>
	);
};

export const TextInput = ({
	value,
	onChange,
	placeholder,
	control,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	control: FieldControl;
}) => (
	<input
		{...control}
		className="input"
		type="text"
		value={value}
		onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
		{...(placeholder ? { placeholder } : {})}
	/>
);

export const TextArea = ({
	value,
	onChange,
	placeholder,
	rows = 4,
	control,
	disabled = false,
	focused = false,
	onKeyDown,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	rows?: number;
	control: FieldControl;
	disabled?: boolean;
	focused?: boolean;
	onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}) => (
	<textarea
		{...control}
		className="input"
		rows={rows}
		disabled={disabled}
		autoFocus={focused}
		{...(onKeyDown ? { onKeyDown } : {})}
		value={value}
		onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
		{...(placeholder ? { placeholder } : {})}
	/>
);

/** Its chevron is drawn inset from the border; the browser's own sits against it. */
export const Select = ({
	value,
	onChange,
	options,
	control,
}: {
	value: string;
	onChange: (value: string) => void;
	options: { value: string; label: string }[];
	control: FieldControl;
}) => (
	<span className="select">
		<select {...control} className="input" value={value} onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}>
			{options.map((o) => (
				<option key={o.value} value={o.value}>
					{o.label}
				</option>
			))}
		</select>
		<Icon name="chevron-down" size="small" />
	</span>
);
