import { useState } from 'react';
import type { CatalogComponent, DesignToken } from '../../src/shared/contract';
import { declaredBy, nameOf, pairContrast, pointsAt, reachOf, roleOf, scaleFamilies, tokenTitle } from '../../src/shared/tokens';
import { useTokenChanges } from './hooks/tokenChanges';
import { TokenUsers } from './TokenUsers';
import { Button } from '../../src/ui/Button';
import { Dialog, DialogButtons } from '../../src/ui/Dialog';
import { Field, Select } from '../../src/ui/Field';
import { Swatch } from '../../src/ui/Swatch';
import { ColorField, LengthField } from './ValueFields';
import { LinkButton } from '../../src/ui/LinkButton';
import { Message } from '../../src/ui/Message';

/** Each change is applied when let go of (the picker closed, the slider released, the hex entered): building again takes about a second. */

/** A step pressed points the token at it, keeping the link; another family chosen changes nothing until one of its steps is. */
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

const Contrast = ({ token }: { token: DesignToken }) => {
	const contrast = pairContrast(token, useTokenChanges());
	if (contrast === null) return null;
	return (
		<Message marks={{ 'data-editor-contrast': '' }}>
			Contrast with {contrast.partner.name}: <strong className={contrast.flag ? 'warning-text' : undefined}>{contrast.ratio}:1</strong>,{' '}
			{contrast.words}
		</Message>
	);
};

const Reach = ({ token }: { token: DesignToken }) => {
	const reach = reachOf(token, useTokenChanges());
	if (reach === null) return null;
	return (
		<div data-reach>
			{reach.used && (
				<div title={reach.used.who}>
					<Message>{reach.used.says}</Message>
				</div>
			)}
			<Message>{reach.also}</Message>
		</div>
	);
};

/** A role's own color, offered beside its scale, cuts its pointer. */
export const TokenEditor = ({ token, components, onClose }: { token: DesignToken; components: CatalogComponent[]; onClose: () => void }) => {
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
					<Button variant="secondary" onPress={() => change(now, null)}>
						Reset
					</Button>
				)}
			</DialogButtons>
		</Dialog>
	);
};
