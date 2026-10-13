import type { ChangeEvent, ReactNode } from 'react';

/** A labelled field of a form, as VS Code's settings draw one: the label above, then the control, then what to know. */
export const Field = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
	<label className="field">
		<span data-part="label" className="field-label">
			{label}
		</span>
		{children}
		{hint && <span className="field-hint">{hint}</span>}
	</label>
);

/** VS Code's input box. */
export const TextInput = ({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder?: string }) => (
	<input
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
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	rows?: number;
}) => (
	<textarea
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
}: {
	value: string;
	onChange: (value: string) => void;
	options: { value: string; label: string }[];
}) => (
	<select className="input" value={value} onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}>
		{options.map((o) => (
			<option key={o.value} value={o.value}>
				{o.label}
			</option>
		))}
	</select>
);
