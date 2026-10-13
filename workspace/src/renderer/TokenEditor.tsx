import { ArrowRightIcon, CheckIcon, CopyIcon, RotateCcwIcon } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { DesignToken } from '../shared/contract';
import { plural } from '../shared/plural';
import { inOrder } from '../shared/primitives';
import { contrastPartner, contrastRatio, lengthParts, pointingAt, readsAs, roleOf, tokenTitle, writtenWith } from '../shared/tokens';
import { textContrast } from '../shared/wcag';
import { ChoiceMenu } from './ChoiceMenu';
import { TokenBranchActions } from './TokenBranchActions';
import { useCopy } from './useCopy';
import type { TokenBranchControls } from './useTokenBranch';
import { labelOf, nameOf, opacity, useTokenChanges } from './tokenChanges';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Slider } from './ui/slider';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { cn } from '@/lib/utils';
import { Swatch } from './Swatch';

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

/** A pair's contrast as WCAG states it, flagged only where the target asks for more (`textContrast`). */
export const ContrastNote = ({ ratio, className = '' }: { ratio: number; className?: string }) => {
	const { accessibility } = useTokenChanges();
	return (
		<span data-contrast={ratio} className={cn(textContrast(ratio, accessibility).flag ? 'text-warning' : 'text-muted-foreground', className)}>
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
 * The scale a token is chosen from: the families the library's palette has in the token's own theme to choose between
 * (`Color family`, a menu when there is more than one), and the steps of the one shown as swatches, the one the token
 * points at now chosen. Pressing a step points the token at it, which keeps the link and changes only this token; choosing
 * another family changes nothing until one of its steps is chosen.
 */
const ColorScale = ({ token, target }: { token: DesignToken; target: DesignToken }) => {
	const { shown, change, isPalette } = useTokenChanges();
	const [family, setFamily] = useState(target.set);
	// Another token's pointer goes only within its own group (a theme, the palette), so the families are that group's.
	const families = inOrder(
		shown.filter((t) => t.kind === token.kind && t.group === target.group && (isPalette(t) || t.set === target.set)),
		(t) => t.set,
	);
	const steps = families.find(([set]) => set === family)?.[1] ?? [];
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center justify-between gap-2">
				<p className="text-muted-foreground text-xs">Color scale</p>
				{families.length > 1 ? (
					<ChoiceMenu
						name="Color family"
						value={family}
						choices={families.map(([set]) => ({ value: set, label: set }))}
						onChange={setFamily}
						align="end"
					/>
				) : (
					<p className="text-sm font-medium">{family}</p>
				)}
			</div>
			{/* One group of choices, so arrow keys move between the steps; each a swatch tile, sized for the swatch, not a button. */}
			<ToggleGroup
				type="single"
				spacing={1}
				aria-label={`Steps of ${family}`}
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
						className="data-[state=on]:ring-ring text-2xs h-auto w-9 flex-col gap-0.5 p-1 data-[state=on]:bg-transparent data-[state=on]:ring-2"
					>
						<Swatch value={s.value} size="size-6" />
						{s.name}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</div>
	);
};

/** What a token resolves to: the color it points at (when it does) and its hex, which can be copied. */
const Resolved = ({ token, target }: { token: DesignToken; target?: DesignToken }) => {
	const [problem, setProblem] = useState<string | null>(null);
	const { copied, copy } = useCopy(setProblem, 'Select the value to copy it.');
	return (
		<div data-resolved className="flex flex-col gap-1">
			<p className="text-muted-foreground text-xs">Resolved value</p>
			<div className="bg-muted/50 flex items-center gap-2 rounded-md p-2">
				<Swatch value={token.value} size="size-6" />
				<div className="flex min-w-0 flex-col">
					{target && <span className="truncate text-sm font-medium">{nameOf(target)}</span>}
					<span className="font-mono text-xs">{token.value}</span>
				</div>
				<Button variant="ghost" size="icon-sm" className="ml-auto" aria-label={`Copy ${token.value}`} onClick={() => void copy(token.value)}>
					{copied ? <CheckIcon /> : <CopyIcon />}
				</Button>
			</div>
			{problem && <p className="text-destructive text-xs">{problem}</p>}
		</div>
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

/**
 * What opens from a value: the token, its title and source, its control, what it reaches and the contrast it leaves, and Reset
 * when changed. **A color that points at another** (a role at a palette step) shows what it references, the scale it is chosen
 * from and what it resolves to; the second choice is its own color, which cuts the pointer. A color that points at nothing
 * (a palette step, a role with a literal color) is a color picker and its hex; a dimension a slider.
 */
export const TokenEditor = ({ token }: { token: DesignToken }) => {
	const { read, byPath, change, isChanged } = useTokenChanges();
	const asRead = read.get(token.path) ?? token;
	// A token given a color of its own still has the tone it pointed at, to go back to.
	const pointer = token.ref ?? asRead.ref;
	const target = pointer && byPath.get(pointer.path);
	const [custom, setCustom] = useState(token.ref === undefined);
	return (
		<div className="flex flex-col gap-3" data-token-editor={token.path}>
			<div className="flex items-center gap-2">
				{token.kind === 'color' && <Swatch value={token.value} size="size-8" />}
				<div className="flex min-w-0 flex-col gap-0.5">
					<p data-token-title className="text-sm font-medium">
						{tokenTitle(token)}
					</p>
					<p className="text-muted-foreground truncate font-mono text-xs" title={`${token.source.file}:${token.source.line}`}>
						{token.source.file}:{token.source.line}
					</p>
				</div>
			</div>
			{token.kind === 'dimension' ? (
				<DimensionField token={asRead} value={token.value} onCommit={(value) => change(token, { value })} />
			) : target ? (
				<>
					<div className="flex flex-col gap-1">
						<p className="text-muted-foreground text-xs">Reference</p>
						{token.ref ? (
							<p data-reference className="bg-muted/50 flex w-fit max-w-full flex-wrap items-center gap-x-2 rounded-md px-2 py-1 text-sm">
								<span className="break-all">{roleOf(token)}</span>
								<ArrowRightIcon className="size-3.5 shrink-0" />
								<span className="font-medium break-all">
									{nameOf(target)}
									{pointer?.alpha && ` at ${opacity(pointer.alpha)}`}
								</span>
							</p>
						) : (
							<p className="text-sm">Was {nameOf(target)}; now a color of its own</p>
						)}
					</div>
					<ColorScale token={token} target={target} />
					<Resolved token={token} target={token.ref ? target : undefined} />
				</>
			) : (
				<ColorField value={token.value} onCommit={(value) => change(token, { value })} />
			)}
			<Contrast token={token} />
			<Reach token={token} />
			{/* The second choice, after what is known of the color: its own, which cuts the pointer. */}
			{target &&
				token.kind !== 'dimension' &&
				(custom ? (
					<div className="flex flex-col gap-1.5">
						<ColorField value={token.value} onCommit={(value) => change(token, { value })} />
						<p className="text-muted-foreground text-xs">A custom color replaces the pointer: a later change to {target.set} will not reach it.</p>
					</div>
				) : (
					<Button variant="ghost" size="sm" className="-ml-2 self-start" onClick={() => setCustom(true)}>
						Use a custom color
					</Button>
				))}
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
 * A token's control, opened from what `children` is (the button that is pressed): beside the panel, over the components it
 * changes, and no taller than the window, scrolling when it is. The one place a token's control is put in a popover, so a row
 * of the palette and a theme's value open it the same way.
 */
export const TokenEditorPopover = ({ token, children }: { token: DesignToken; children: ReactNode }) => (
	<Popover>
		<PopoverTrigger asChild>{children}</PopoverTrigger>
		<PopoverContent side="left" align="start" className="max-h-(--radix-popover-content-available-height) w-80 overflow-y-auto">
			<TokenEditor token={token} />
		</PopoverContent>
	</Popover>
);

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
