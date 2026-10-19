import type { CatalogComponent, ChangeReach as ChangeReachAnswer, ComponentReach, TokenEdit, ValueChange } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { useChangeReach } from './hooks/useChangeReach';
import { saidValue, valueTitle } from '../../src/shared/valueNames';
import { ChangeRow, ValueList } from './ui/ValueItem';
import { LinkButton } from './ui/LinkButton';
import { Message } from './ui/Message';

/** What changed of a value, named as the Styles name it, and dark when it is in dark. */
const changeName = (c: ValueChange): string =>
	c.mode === 'dark' ? `${valueTitle(c.property, c.variant)} · dark` : valueTitle(c.property, c.variant);

/** One component the change moves: its name, which opens its tab, then what changed of its values, or that it moved inside. */
export const Moved = ({ reach, name, here, onOpen }: { reach: ComponentReach; name: string; here: boolean; onOpen: () => void }) => (
	<div data-moved={reach.file} className="value-group">
		<h3 className="value-group-name">
			{here ? <span>{name}</span> : <LinkButton onPress={onOpen}>{name}</LinkButton>}
			{here && <span className="value-group-note">This one</span>}
		</h3>
		<ValueList>
			{reach.changes.map((c) => (
				<ChangeRow
					key={`${c.mode}|${c.property}|${c.variant}|${c.from}|${c.to}`}
					name={changeName(c)}
					from={saidValue(c.property, c.from)}
					to={saidValue(c.property, c.to)}
				/>
			))}
			{reach.inside && <li className="quiet value-inside">Its stories draw differently, in a part its values do not read.</li>}
		</ValueList>
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
				<Message>Drawing every component with the change, to see which follow it.</Message>
			) : reach.state === 'failed' ? (
				<Message size="block" tone="warning" title="What the change moves could not be drawn">
					{reach.error}
				</Message>
			) : (
				<>
					<Message marks={{ 'data-reach-summary': '' }}>
						{reach.moved.length === 0
							? `It moves no component, in their stories drawn: ${plural(reach.unchanged, 'component')} unchanged.`
							: `It moves ${plural(reach.moved.length, 'component')}; ${reach.unchanged} unchanged, in their stories drawn.`}
						{reach.notDrawn.length > 0 && ` ${plural(reach.notDrawn.length, 'component')} did not draw, so cannot be said.`}
					</Message>
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
