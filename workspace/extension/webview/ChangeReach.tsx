import type { CatalogComponent, ChangeReach as ChangeReachAnswer, ComponentReach, TokenEdit, ValueChange } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { useChangeReach } from '../../src/renderer/useChangeReach';
import { Notice } from './ui/Notice';
import { saidValue, valueTitle } from '../../src/shared/valueNames';

/** What changed of a value, named as the Styles name it, and dark when it is in dark. */
const changeName = (c: ValueChange): string =>
	c.mode === 'dark' ? `${valueTitle(c.property, c.variant)} · dark` : valueTitle(c.property, c.variant);

/** One component the change moves: its name, which opens its tab, then what changed of its values, or that it moved inside. */
export const Moved = ({ reach, name, here, onOpen }: { reach: ComponentReach; name: string; here: boolean; onOpen: () => void }) => (
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
				<li key={`${c.mode}|${c.property}|${c.variant}|${c.from}|${c.to}`} className="token">
					<span className="value-cell value-change">
						<span className="value-label">{changeName(c)}</span>
						<span className="value-drawn">
							<span>{saidValue(c.property, c.from)}</span> <span>→ {saidValue(c.property, c.to)}</span>
						</span>
					</span>
				</li>
			))}
			{reach.inside && <li className="quiet value-inside">Its stories draw differently, in a part its values do not read.</li>}
		</ul>
	</div>
);

/**
 * What a change moves (Phase 3 of adjusting a component): every component drawn with it, and those it moves, each with what
 * changed, and how many it does not move, in their stories drawn (never a claim about every use), and those that did not
 * draw. A name opens that component's tab. For a token change being tried (`ChangeReach`), and for the values tried on a
 * component, written where they are found (Phase 4): `title` names which.
 */
export const ReachView = ({
	reach,
	title,
	component,
	components,
	onOpen,
}: {
	reach: Exclude<ChangeReachAnswer, { state: 'none' }>;
	title: string;
	component: CatalogComponent;
	components: CatalogComponent[];
	onOpen: (id: string) => void;
}) => {
	const names = new Map(components.map((c) => [c.id, c.name]));
	return (
		<section aria-label={title} className="aside-section">
			<h2 className="aside-title">{title}</h2>
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

/** Moved by the change: what the token change being tried moves (`ReachView`); nothing while no token change is tried. */
export const ChangeReach = ({
	edits,
	...shown
}: {
	edits: TokenEdit[];
	component: CatalogComponent;
	components: CatalogComponent[];
	onOpen: (id: string) => void;
}) => {
	const reach = useChangeReach(edits);
	return reach.state === 'none' ? null : <ReachView reach={reach} title="Moved by the change" {...shown} />;
};
