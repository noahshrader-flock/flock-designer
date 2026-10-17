import { type CSSProperties, useEffect, useState } from 'react';
import { lengthSpan } from '../../src/shared/tokens';
import { useColorField } from '../../src/renderer/useColorField';

/**
 * The fields a value is changed with, for a token (T3, `TokenEditor`) and a component's own value (Phase 2, `ValueEditor`)
 * alike, so each kind of value is changed one way wherever it is.
 */

/**
 * A color picker and its hex: the picker applies when it is closed, the hex when Enter is pressed or it is left. An opacity is
 * kept. With `live`, the picker applies as it moves too, for a value tried without a build.
 */
export const ColorField = ({ value, onCommit, live = false }: { value: string; onCommit: (hex: string) => void; live?: boolean }) => {
	const { picker, hex, setHex, commit } = useColorField(value, onCommit, { live });
	return (
		<div className="color-field">
			<input {...picker} type="color" aria-label="Pick a color" className="color-picker" />
			<input
				className="input token-hex"
				aria-label="Hex"
				spellCheck={false}
				value={hex}
				onChange={(e) => setHex(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => e.key === 'Enter' && commit()}
			/>
		</div>
	);
};

/**
 * A length as a slider and its number, from nothing to twice what it was (`was`): applied when the slider is let go of, as
 * building again takes about a second; with `live`, as it moves, for a value tried without a build.
 */
export const LengthField = ({
	label,
	value,
	was,
	onCommit,
	live = false,
}: {
	label: string;
	value: string;
	was: string;
	onCommit: (length: string) => void;
	live?: boolean;
}) => {
	const { number, unit, max, step } = lengthSpan(value, was);
	const [n, setN] = useState(number);
	useEffect(() => setN(number), [number]);
	const commit = () => n !== number && onCommit(`${n}${unit}`);
	return (
		<div className="dimension-field">
			<input
				type="range"
				aria-label={label}
				min={0}
				max={max}
				step={step}
				value={n}
				// How far along it is, for the stylesheet to fill the track to (a range has no fill of its own once it is drawn here).
				style={{ '--fill': `${max > 0 ? (n / max) * 100 : 0}%` } as CSSProperties}
				onChange={(e) => {
					const next = Number(e.target.value);
					setN(next);
					if (live) onCommit(`${next}${unit}`);
				}}
				onPointerUp={commit}
				onKeyUp={commit}
			/>
			<span className="token-value">
				{n}
				{unit}
			</span>
		</div>
	);
};
