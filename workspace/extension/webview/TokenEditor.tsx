import { useEffect, useRef, useState } from 'react';
import type { DesignToken } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import {
	hexAndAlpha,
	isHex,
	labelOf,
	lengthRange,
	nameOf,
	pointingAt,
	roleOf,
	scaleFamilies,
	tokenTitle,
	typedHex,
	writtenWith,
} from '../../src/shared/tokens';
import { pairContrast, pointsAt, useTokenChanges } from '../../src/renderer/tokenChanges';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { Field, Select } from './ui/Field';
import { Swatch } from './ui/Swatch';

/**
 * Changing a token (6.2, the app's T3, rebuilt in VS Code's language): what opens from a token's row, in a dialog over the
 * page, chosen by what the token is and whether it points at another (decision 20). **Not an editor** (decision 27): a
 * change is tried in the previews and kept nowhere until it is saved, and what it does is said where it is made, the
 * contrast it leaves and what else it moves. Each is applied when it is let go of (the picker closed, the slider
 * released, the hex entered): building again takes about a second.
 */

/** A color picker and its hex: the picker applies when it is closed, the hex when Enter is pressed or it is left. An opacity is kept. */
const ColorField = ({ value, onCommit }: { value: string; onCommit: (hex: string) => void }) => {
	const { hex: own, alpha } = hexAndAlpha(value);
	const [hex, setHex] = useState(own);
	const picker = useRef<HTMLInputElement>(null);
	useEffect(() => setHex(own), [own]);
	// The browser's own `change`: when the picker is closed, not on every color it passes through.
	useEffect(() => {
		const el = picker.current;
		const done = () => {
			const picked = el && typedHex(el.value, alpha);
			if (picked) onCommit(picked);
		};
		el?.addEventListener('change', done);
		return () => el?.removeEventListener('change', done);
	}, [onCommit, alpha]);
	const commit = () => {
		const typed = typedHex(hex, alpha);
		if (typed) onCommit(typed);
		else setHex(own);
	};
	return (
		<div className="color-field">
			<input
				ref={picker}
				type="color"
				aria-label="Pick a color"
				className="color-picker"
				value={(isHex(hex) ? hex : own).toLowerCase()}
				onChange={(e) => setHex(e.target.value.toUpperCase())}
			/>
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

/** A length as a slider and its number, applied when the slider is let go of: from nothing to twice what the design system has. */
const DimensionField = ({ token, value, onCommit }: { token: DesignToken; value: string; onCommit: (length: string) => void }) => {
	const { number, unit, max, step } = lengthRange(token, value);
	const [n, setN] = useState(number);
	useEffect(() => setN(number), [number]);
	const commit = () => n !== number && onCommit(`${n}${unit}`);
	return (
		<div className="dimension-field">
			<input
				type="range"
				aria-label={nameOf(token)}
				min={0}
				max={max}
				step={step}
				value={n}
				onChange={(e) => setN(Number(e.target.value))}
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

/**
 * The scale a role is pointed within: the families its group's palette has (a choice when there are several), and the
 * steps of the one shown as swatches, the one pointed at chosen. Pressing a step points the token at it, which keeps the
 * link and changes only this token; choosing another family changes nothing until one of its steps is chosen.
 */
const ColorScale = ({ token, target }: { token: DesignToken; target: DesignToken }) => {
	const { shown, change, isPalette } = useTokenChanges();
	const [family, setFamily] = useState(target.set);
	const families = scaleFamilies(shown, token, target, isPalette);
	const steps = families.find(([set]) => set === family)?.[1] ?? [];
	return (
		<div className="field">
			<span className="field-label">Color scale</span>
			{families.length > 1 && (
				<Field label="Color family">
					{(control) => (
						<Select control={control} value={family} onChange={setFamily} options={families.map(([set]) => ({ value: set, label: set }))} />
					)}
				</Field>
			)}
			<div role="radiogroup" aria-label={`Steps of ${family}`} className="steps">
				{steps.map((s) => (
					<button
						key={s.path}
						type="button"
						role="radio"
						aria-checked={token.ref?.path === s.path}
						aria-label={nameOf(s)}
						title={`${nameOf(s)} · ${s.value}`}
						className="step"
						onClick={() => token.ref?.path !== s.path && change(token, { ref: s.path })}
					>
						<Swatch value={s.value} />
						<span>{s.name}</span>
					</button>
				))}
			</div>
		</div>
	);
};

/** The contrast a color leaves with the one it is read with, and whether that is enough for text at the design system's target. */
const Contrast = ({ token }: { token: DesignToken }) => {
	const contrast = pairContrast(token, useTokenChanges());
	if (contrast === null) return null;
	return (
		<p data-editor-contrast className="quiet">
			Contrast with {contrast.partner.name}: <strong className={contrast.flag ? 'warning-text' : undefined}>{contrast.ratio}:1</strong>,{' '}
			{contrast.words}
		</p>
	);
};

/** What changing a token also moves: the roles that point at it, and any written in the same place. */
const Reach = ({ token }: { token: DesignToken }) => {
	const { shown, isPointedInto } = useTokenChanges();
	const users = pointingAt(shown, token.path);
	const also = writtenWith(shown, token);
	const pointedInto = users.length > 0 || isPointedInto(token);
	if (!pointedInto && also.length === 0) return null;
	return (
		<div data-reach className="quiet">
			{pointedInto && (
				<p title={users.map(labelOf).join('\n')}>{users.length > 0 ? `Used by ${plural(users.length, 'role')}` : 'Not used by any role'}</p>
			)}
			{also.length > 0 && <p>Also changes {also.map(labelOf).join(', ')}: written in one place.</p>}
		</div>
	);
};

/**
 * A token's control, in a dialog: its title and file, then by what it is: a role that points at another (what it
 * references, the scale it is chosen from, and its own color as a second choice, which cuts the pointer), a color of its
 * own (a picker and its hex), or a length (a slider). Then the contrast it leaves, what it reaches, and Reset when changed.
 */
export const TokenEditor = ({ token, onClose }: { token: DesignToken; onClose: () => void }) => {
	const { read, byPath, change, isChanged } = useTokenChanges();
	// As changed now: the row was pressed on what it showed then.
	const now = byPath.get(token.path) ?? token;
	const asRead = read.get(token.path) ?? token;
	const pointer = now.ref ?? asRead.ref;
	const target = pointer && byPath.get(pointer.path);
	const [custom, setCustom] = useState(now.ref === undefined);
	return (
		<Dialog title={tokenTitle(now)} onClose={onClose}>
			<div data-token-editor={now.path} className="token-editor">
				<p className="quiet token-source">
					{now.kind === 'color' && <Swatch value={now.value} />}
					<code>
						{now.source.file}:{now.source.line}
					</code>
				</p>
				{now.kind === 'dimension' ? (
					<DimensionField token={asRead} value={now.value} onCommit={(value) => change(now, { value })} />
				) : target ? (
					<>
						<p data-reference>
							{now.ref ? (
								<>
									{roleOf(now)} → <strong>{pointsAt(now, target)}</strong>
								</>
							) : (
								`Was ${nameOf(target)}; now a color of its own`
							)}
						</p>
						<ColorScale token={now} target={target} />
						<p className="quiet">
							Resolves to <code>{now.value}</code>
						</p>
					</>
				) : (
					<ColorField value={now.value} onCommit={(value) => change(now, { value })} />
				)}
				<Contrast token={now} />
				<Reach token={now} />
				{target &&
					now.kind !== 'dimension' &&
					(custom ? (
						<div className="field">
							<ColorField value={now.value} onCommit={(value) => change(now, { value })} />
							<p className="quiet">A custom color replaces the pointer: a later change to {target.set} will not reach it.</p>
						</div>
					) : (
						<button type="button" className="link" onClick={() => setCustom(true)}>
							Use a custom color
						</button>
					))}
			</div>
			<div className="dialog-buttons">
				{isChanged(now) && (
					<Button secondary onClick={() => change(now, null)}>
						Reset
					</Button>
				)}
				<Button onClick={onClose}>Done</Button>
			</div>
		</Dialog>
	);
};
