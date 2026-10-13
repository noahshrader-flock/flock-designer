import { type KeyboardEvent, useRef } from 'react';

/**
 * A choice of a few views, side by side, one always chosen: VS Code has no control for this in a side bar, so it is drawn
 * as its buttons are (the chosen one primary, the others secondary) from the theme's own variables. A radio group to
 * assistive technology: only the chosen one is in the tab order, and the arrow keys, Home and End move the choice.
 */
export interface ToggleOption<Value extends string> {
	value: Value;
	label: string;
	/** A codicon's name: `folder-library` for `codicon-folder-library`. */
	icon: string;
}

export const Toggle = <Value extends string>({
	label,
	options,
	value,
	onChange,
}: {
	/** Its name to assistive technology. */
	label: string;
	options: ToggleOption<Value>[];
	value: Value;
	onChange: (value: Value) => void;
}) => {
	const buttons = useRef<(HTMLButtonElement | null)[]>([]);
	const choose = (index: number) => {
		const next = options[(index + options.length) % options.length];
		if (!next) return;
		onChange(next.value);
		buttons.current[options.indexOf(next)]?.focus();
	};
	const at = options.findIndex((o) => o.value === value);
	const onKeyDown = (e: KeyboardEvent) => {
		const to = { ArrowRight: at + 1, ArrowDown: at + 1, ArrowLeft: at - 1, ArrowUp: at - 1, Home: 0, End: options.length - 1 }[e.key];
		if (to === undefined) return;
		e.preventDefault();
		choose(to);
	};
	return (
		<div role="radiogroup" aria-label={label} className="toggle" onKeyDown={onKeyDown}>
			{options.map((o, i) => (
				<button
					key={o.value}
					ref={(el) => {
						buttons.current[i] = el;
					}}
					type="button"
					role="radio"
					aria-checked={o.value === value}
					tabIndex={o.value === value ? 0 : -1}
					className="toggle-option"
					onClick={() => onChange(o.value)}
				>
					<span aria-hidden="true" className={`codicon codicon-${o.icon}`} />
					{o.label}
				</button>
			))}
		</div>
	);
};
