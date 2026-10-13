import { RotateCcwIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DesignToken } from '../shared/contract';
import { plural } from '../shared/plural';
import { contrastPartner, contrastRatio, lengthParts, pointingAt, readsAs, writtenWith } from '../shared/tokens';
import { textContrast } from '../shared/wcag';
import { TokenBranchActions } from './TokenBranchActions';
import type { TokenBranchControls } from './useTokenBranch';
import { labelOf, nameOf, opacity, useTokenChanges } from './tokenChanges';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Slider } from './ui/slider';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';

/**
 * Changing a token (T3 of the design system plan): what opens from a row of the tokens panel, chosen by what the token is
 * and whether it points at another (decision 20), and the list of what has been changed. The change itself is
 * `tokenChanges.ts`'s; this is how it is shown and made. **Not an editor** (decision
 * 27): a change is tried in the previews and kept nowhere, and what it does is said where it is made: the contrast it
 * leaves, and what else it moves.
 *
 * - **A token that points at another** (`primary.main` is `pineGreen[50]`) is pointed at another step of the same tone,
 *   which keeps the link. Its own color is the second choice, plainly marked, since it cuts the link.
 * - **A color with no pointer** (a tone step, a plain role) is a color picker and its hex.
 * - **A dimension** (the base spacing, the base radius) is a slider and its number.
 *
 * Each is applied when it is let go of (the picker closed, the slider released, the hex entered): building again takes
 * about a second, so a change is not built on every movement.
 */

/** What a token is changed to: pointed at another token, by its path, or given a value of its own. */
export type ChangeTo = { ref: string } | { value: string };

/** A color, as a small square. Its color is the token's own, a runtime value, so it is inline. */
export const Swatch = ({ value, size = 'size-4' }: { value: string; size?: string }) => (
	<span data-swatch className={`${size} shrink-0 rounded-sm border`} style={{ backgroundColor: value }} />
);

/** A pair's contrast as WCAG states it, flagged only where the target asks for more (`textContrast`). */
export const ContrastNote = ({ ratio, className = '' }: { ratio: number; className?: string }) => {
	const { accessibility } = useTokenChanges();
	return (
		<span data-contrast={ratio} className={`${textContrast(ratio, accessibility).flag ? 'text-warning' : 'text-muted-foreground'} ${className}`}>
			{ratio}:1
		</span>
	);
};

/**
 * A color picker and its hex. The picker applies when it is closed; the hex when Enter is pressed or it is left, and only
 * a hex is applied. An opacity the color had is kept: the picker has none.
 */
const HEX6 = /^#[0-9a-f]{6}$/i;
const ColorField = ({ value, onCommit }: { value: string; onCommit: (hex: string) => void }) => {
	const alpha = value.length === 9 ? value.slice(7) : '';
	const [hex, setHex] = useState(value.slice(0, 7));
	const picker = useRef<HTMLInputElement>(null);
	useEffect(() => setHex(value.slice(0, 7)), [value]);
	// The browser's own `change`: when the picker is closed, not on every color it passes through.
	useEffect(() => {
		const el = picker.current;
		const done = () => el && onCommit(`${el.value.toUpperCase()}${alpha}`);
		el?.addEventListener('change', done);
		return () => el?.removeEventListener('change', done);
	}, [onCommit, alpha]);
	const commit = () => {
		if (HEX6.test(hex.trim())) onCommit(`${hex.trim().toUpperCase()}${alpha}`);
		else setHex(value.slice(0, 7));
	};
	return (
		<div className="flex items-center gap-2">
			<input
				ref={picker}
				type="color"
				aria-label="Pick a color"
				value={(HEX6.test(hex) ? hex : value.slice(0, 7)).toLowerCase()}
				onChange={(e) => setHex(e.target.value.toUpperCase())}
				className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
			/>
			<Input
				aria-label="Hex"
				value={hex}
				spellCheck={false}
				className="font-mono"
				onChange={(e) => setHex(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => e.key === 'Enter' && commit()}
			/>
		</div>
	);
};

/** A length as a slider and its number, applied when the slider is let go of. Its range is from its kind, not the token. */
const DimensionField = ({ token, value, onCommit }: { token: DesignToken; value: string; onCommit: (length: string) => void }) => {
	const { number, unit } = lengthParts(value) ?? { number: 0, unit: 'px' };
	const [n, setN] = useState(number);
	useEffect(() => setN(number), [number]);
	// From nothing to twice what the library has, at least a useful span: whole pixels, or eighths of a rem.
	const px = unit === 'px';
	const max = Math.max(px ? 32 : 2, (lengthParts(token.value)?.number ?? number) * 2);
	return (
		<div className="flex items-center gap-3">
			<Slider
				aria-label={nameOf(token)}
				min={0}
				max={max}
				step={px ? 1 : 0.125}
				value={[n]}
				onValueChange={([v]) => setN(v as number)}
				onValueCommit={([v]) => onCommit(`${v}${unit}`)}
			/>
			<span className="w-16 shrink-0 text-right font-mono text-xs">
				{n}
				{unit}
			</span>
		</div>
	);
};

/**
 * Another step of the tone a token points at, as swatches: pressing one points the token at it. The step it points at
 * now is pressed.
 */
const StepPicker = ({ token, target }: { token: DesignToken; target: DesignToken }) => {
	const { shown, change } = useTokenChanges();
	const steps = shown.filter((t) => t.group === target.group && t.set === target.set);
	return (
		// One group of choices, so arrow keys move between the steps; each a swatch tile, sized for the swatch, not a button.
		<ToggleGroup
			type="single"
			spacing={1}
			aria-label={`Steps of ${target.set}`}
			value={token.ref?.path ?? ''}
			// Pressing the one pointed at would unpress it, which the group says as an empty value: ignored.
			onValueChange={(path) => path && change(token, { ref: path })}
			className="flex-wrap"
		>
			{steps.map((s) => (
				<ToggleGroupItem
					key={s.path}
					value={s.path}
					aria-label={nameOf(s)}
					title={`${nameOf(s)} · ${s.value}`}
					className="data-[state=on]:ring-ring h-auto w-9 flex-col gap-0.5 p-1 text-[10px] data-[state=on]:bg-transparent data-[state=on]:ring-2"
				>
					<Swatch value={s.value} size="size-6" />
					{s.name}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
};

/** What changing a token also moves: the tokens that point at it, and any written in the same place. */
const Reach = ({ token }: { token: DesignToken }) => {
	const { shown, isPointedInto } = useTokenChanges();
	const users = pointingAt(shown, token.path);
	const also = writtenWith(shown, token);
	// A step of a family roles point at says so even when none points at this one: it can be changed freely.
	const pointedInto = users.length > 0 || isPointedInto(token);
	if (!pointedInto && also.length === 0) return null;
	return (
		<div data-reach className="text-muted-foreground flex flex-col gap-1 text-xs">
			{pointedInto && (
				<p title={users.map(labelOf).join('\n')}>{users.length > 0 ? `Used by ${plural(users.length, 'role')}` : 'Not used by any role'}</p>
			)}
			{also.length > 0 && <p>Also changes {also.map(labelOf).join(', ')}: written in one place.</p>}
		</div>
	);
};

/** The contrast a color leaves with the one it is read with, and whether that is enough for text. */
const Contrast = ({ token }: { token: DesignToken }) => {
	const { shown, accessibility } = useTokenChanges();
	const partner = contrastPartner(token, shown);
	const ratio = partner ? contrastRatio(token.value, partner.value) : null;
	if (!partner || ratio === null) return null;
	return (
		<p className="text-xs">
			Contrast with {partner.name}: <ContrastNote ratio={ratio} className="font-medium" />
			<span className="text-muted-foreground">, {textContrast(ratio, accessibility).words}</span>
		</p>
	);
};

/** What opens from a row: the token, its control, what it reaches and the contrast it leaves, and Reset when changed. */
export const TokenEditor = ({ token }: { token: DesignToken }) => {
	const { read, byPath, change, isChanged } = useTokenChanges();
	const asRead = read.get(token.path) ?? token;
	// A token given a color of its own still has the tone it pointed at, to go back to.
	const pointer = token.ref ?? asRead.ref;
	const target = pointer && byPath.get(pointer.path);
	const [custom, setCustom] = useState(token.ref === undefined);
	return (
		<div className="flex flex-col gap-3" data-token-editor={token.path}>
			<div className="flex flex-col gap-0.5">
				<p className="text-sm font-medium">{labelOf(token)}</p>
				<p className="text-muted-foreground font-mono text-xs">
					{token.source.file}:{token.source.line}
				</p>
			</div>
			{token.kind === 'dimension' ? (
				<DimensionField token={asRead} value={token.value} onCommit={(value) => change(token, { value })} />
			) : target ? (
				<div className="flex flex-col gap-2">
					<p className="text-muted-foreground text-xs">
						{token.ref
							? `Points at ${nameOf(target)}${pointer?.alpha ? ` at ${opacity(pointer.alpha)}` : ''}`
							: `Was ${nameOf(target)}; now a color of its own`}
					</p>
					<StepPicker token={token} target={target} />
					{custom ? (
						<div className="flex flex-col gap-1.5">
							<ColorField value={token.value} onCommit={(value) => change(token, { value })} />
							<p className="text-muted-foreground text-xs">A custom color replaces the pointer: a later change to {target.set} will not reach it.</p>
						</div>
					) : (
						<Button variant="ghost" size="sm" className="-ml-2 self-start" onClick={() => setCustom(true)}>
							Use a custom color
						</Button>
					)}
				</div>
			) : (
				<ColorField value={token.value} onCommit={(value) => change(token, { value })} />
			)}
			<Contrast token={token} />
			<Reach token={token} />
			{isChanged(token) && (
				<Button variant="outline" size="sm" className="self-start" onClick={() => change(token, null)}>
					<RotateCcwIcon />
					Reset
				</Button>
			)}
		</div>
	);
};

/**
 * What has been changed, above the tabs: each change, from what the library has to what it is now, with a reset for each
 * and for all, then what can be done with it (`TokenBranchActions`): saved to a branch, and proposed. It stays while a
 * branch is kept, even with nothing changed, so a branch can still be proposed or left.
 */
export const ChangedTokens = ({ live, branch }: { live: boolean; branch: TokenBranchControls }) => {
	const { edits, read, byPath, change, clear } = useTokenChanges();
	if (edits.length === 0 && branch.branch === null) return null;
	return (
		<section aria-label="Changed" data-changed-tokens className="flex flex-col gap-2 border-b p-4">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold">
					Changed <span className="text-muted-foreground font-normal">{edits.length}</span>
				</h3>
				{edits.length > 0 && (
					<Button variant="ghost" size="sm" className="-mr-2" onClick={clear}>
						Reset all
					</Button>
				)}
			</div>
			{edits.length === 0 ? (
				<p className="text-muted-foreground text-sm">Every token is as the library has it.</p>
			) : (
				<ul className="flex flex-col">
					{edits.map((e) => {
						const was = read.get(e.path) as DesignToken;
						const now = byPath.get(e.path) as DesignToken;
						return (
							<li key={e.path} data-change={e.path} className="flex items-center gap-2 py-1 text-sm">
								{now.kind === 'color' && <Swatch value={now.value} />}
								<span className="min-w-0 truncate">{labelOf(was)}</span>
								<span className="text-muted-foreground ml-auto shrink-0 font-mono text-xs">
									{readsAs(was, read)} → {readsAs(now, byPath)}
								</span>
								<Button variant="ghost" size="icon-sm" aria-label={`Reset ${labelOf(was)}`} onClick={() => change(was, null)}>
									<RotateCcwIcon />
								</Button>
							</li>
						);
					})}
				</ul>
			)}
			{edits.length > 0 && <p className="text-muted-foreground text-xs">{live ? 'Tried in the previews.' : 'Open a component to see them.'}</p>}
			<TokenBranchActions controls={branch} />
		</section>
	);
};
