import { useState } from 'react';
import type { CatalogComponent, DesignToken } from '../../src/shared/contract';
import { declaredBy, nameOf, pairContrast, pointsAt, reachOf, roleOf, scaleFamilies, tokenTitle } from '../../src/shared/tokens';
import { useTokenChanges } from './hooks/tokenChanges';
import { TokenUsers } from './TokenUsers';
import { Button } from './ui/Button';
import { Dialog, DialogButtons } from './ui/Dialog';
import { Field, Select } from './ui/Field';
import { Swatch } from './ui/Swatch';
import { ColorField, LengthField } from './ValueFields';
import { LinkButton } from './ui/LinkButton';
import { Message } from './ui/Message';

/**
 * Changing a token (6.2, the app's T3, rebuilt in VS Code's language): what opens from a token's row, in a dialog over the
 * page, chosen by what the token is and whether it points at another (decision 20). **Not an editor** (decision 27): a
 * change is tried in the previews and kept nowhere until it is saved, and what it does is said where it is made, the
 * contrast it leaves and what else it moves. Each is applied when it is let go of (the picker closed, the slider
 * released, the hex entered): building again takes about a second.
 */

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
						title={nameOf(s)}
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
	const reach = reachOf(token, useTokenChanges());
	if (reach === null) return null;
	return (
		<div data-reach className="quiet">
			{reach.used && <p title={reach.used.who}>{reach.used.says}</p>}
			{reach.also && <p>{reach.also}</p>}
		</div>
	);
};

/**
 * A token's control, in a dialog: its title and file, then by what it is: a role that points at another (what it
 * references, the scale it is chosen from, and its own color as a second choice, which cuts the pointer), a color of its
 * own (a picker and its hex), or a length (a slider). Then the contrast it leaves, what it reaches, and Reset when changed.
 */
export const TokenEditor = ({
	token,
	components,
	onClose,
}: {
	token: DesignToken;
	/** The library's components, by name, for the ones that draw with it; a name opens its tab. */
	components: CatalogComponent[];
	onClose: () => void;
}) => {
	const { read, byPath, change, isChanged } = useTokenChanges();
	// As changed now: the row was pressed on what it showed then.
	const now = byPath.get(token.path) ?? token;
	const asRead = read.get(token.path) ?? token;
	const pointer = now.ref ?? asRead.ref;
	const target = pointer && byPath.get(pointer.path);
	const [custom, setCustom] = useState(now.ref === undefined);
	const declared = declaredBy(now);
	return (
		<Dialog title={tokenTitle(now)} onClose={onClose} focus="panel">
			<div data-token-editor={now.path} className="token-editor">
				<p className="quiet token-source">
					{now.kind === 'color' && <Swatch value={now.value} />}
					<code>
						{now.source.file}:{now.source.line}
					</code>
				</p>
				{declared && <Message>{declared}</Message>}
				{now.kind === 'dimension' ? (
					<LengthField label={nameOf(asRead)} value={now.value} was={asRead.value} onCommit={(value) => change(now, { value })} />
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
						<Message>
							Resolves to <code>{now.value}</code>
						</Message>
					</>
				) : (
					<ColorField value={now.value} onCommit={(value) => change(now, { value })} />
				)}
				<Contrast token={now} />
				<Reach token={now} />
				<TokenUsers token={now} components={components} />
				{target &&
					now.kind !== 'dimension' &&
					(custom ? (
						<div className="field">
							<ColorField value={now.value} onCommit={(value) => change(now, { value })} />
							<Message>A custom color replaces the pointer: a later change to {target.set} will not reach it.</Message>
						</div>
					) : (
						<LinkButton onPress={() => setCustom(true)}>Use a custom color</LinkButton>
					))}
			</div>
			<DialogButtons>
				{isChanged(now) && (
					<Button variant="secondary" onClick={() => change(now, null)}>
						Reset
					</Button>
				)}
			</DialogButtons>
		</Dialog>
	);
};
