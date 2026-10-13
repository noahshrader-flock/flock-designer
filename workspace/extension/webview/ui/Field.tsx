import { type ChangeEvent, type ReactNode, useId } from 'react';

/** What a control is given to be named and described by its field: its id, and the hint that describes it, if it has one. */
interface FieldControl {
	id: string;
	'aria-describedby'?: string;
}

/**
 * A labelled field of a form, as VS Code's settings draw one: the label above, then the control, then what to know. The
 * label alone names the control, and the hint describes it, so a screen reader says each as what it is. `children` draws
 * the control, given what ties it to them.
 */
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

/** VS Code's input box. */
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

/** VS Code's input box, for more than a line. */
export const TextArea = ({
	value,
	onChange,
	placeholder,
	rows = 4,
	control,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	rows?: number;
	control: FieldControl;
}) => (
	<textarea
		{...control}
		className="input"
		rows={rows}
		value={value}
		onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
		{...(placeholder ? { placeholder } : {})}
	/>
);

/** VS Code's dropdown. */
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
	<select {...control} className="input" value={value} onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}>
		{options.map((o) => (
			<option key={o.value} value={o.value}>
				{o.label}
			</option>
		))}
	</select>
);
