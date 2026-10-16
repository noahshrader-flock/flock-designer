import { COLOR_VALUES, type CatalogComponent, type ComponentReach, type TokenEdit, type ValueChange } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { colorAsRead } from '../../src/shared/tokens';
import { useChangeReach } from '../../src/renderer/useChangeReach';
import { Notice } from './ui/Notice';
import { VALUE_NAMES } from './ValueEditor';

/** What changed of a value, named as the Values name it (its property, its variant, dark when only there). */
const changeName = (c: ValueChange): string =>
	[VALUE_NAMES[c.property], ...(c.variant === null ? [] : [c.variant]), ...(c.mode === 'dark' ? ['dark'] : [])].join(' · ');

/** A value as it is read: a colour as a token's is. */
const said = (c: ValueChange, value: string): string => (COLOR_VALUES.has(c.property) ? colorAsRead(value) : value);

/** One component the change moves: its name, which opens its tab, then what changed of its values, or that it moved inside. */
const Moved = ({ reach, name, here, onOpen }: { reach: ComponentReach; name: string; here: boolean; onOpen: () => void }) => (
	<div data-moved={reach.file} className="value-group">
		<h3 className="value-group-name">
			{here ? (
				<span>{name}</span>
			) : (
				<button type="button" className="link" onClick={onOpen}>
					{name}
				</button>
			)}
			{here && <span className="value-group-note">This one</span>}
		</h3>
		<ul className="tokens">
			{reach.changes.map((c) => (
				<li key={`${c.mode}|${c.property}|${c.variant}|${c.from}`} className="token">
					<span className="value-cell">
						<span className="value-label">{changeName(c)}</span>
						<span className="value-drawn">
							{said(c, c.from)} → {said(c, c.to)}
						</span>
					</span>
				</li>
			))}
			{reach.inside && <li className="quiet value-inside">Its stories draw differently, in a part its values do not read.</li>}
		</ul>
	</div>
);

/**
 * Moved by the change (Phase 3 of adjusting a component): while a token change is tried, every component drawn with it, and
 * those it moves, each with what changed, and how many it does not move, in their stories drawn (never a claim about every
 * use), and those that did not draw. A name opens that component's tab. Nothing while no token change is tried.
 */
export const ChangeReach = ({
	edits,
	component,
	components,
	onOpen,
}: {
	edits: TokenEdit[];
	component: CatalogComponent;
	components: CatalogComponent[];
	onOpen: (id: string) => void;
}) => {
	const reach = useChangeReach(edits);
	if (reach.state === 'none') return null;
	const names = new Map(components.map((c) => [c.id, c.name]));
	return (
		<section aria-label="Moved by the change" className="aside-section">
			<h2 className="aside-title">Moved by the change</h2>
			{reach.state === 'building' ? (
				<p className="quiet">Drawing every component with the change, to see which follow it.</p>
			) : reach.state === 'failed' ? (
				<Notice title="What the change moves could not be drawn">{reach.error}</Notice>
			) : (
				<>
					<p className="quiet" data-reach-summary>
						{reach.moved.length === 0
							? `It moves no component, in their stories drawn: ${plural(reach.unchanged, 'component')} unchanged.`
							: `It moves ${plural(reach.moved.length, 'component')}; ${reach.unchanged} unchanged, in their stories drawn.`}
						{reach.notDrawn.length > 0 && ` ${plural(reach.notDrawn.length, 'component')} did not draw, so cannot be said.`}
					</p>
					{reach.moved.map((m) => (
						<Moved key={m.file} reach={m} name={names.get(m.file) ?? m.file} here={m.file === component.id} onOpen={() => onOpen(m.file)} />
					))}
				</>
			)}
		</section>
	);
};
