import type { CatalogComponent, ChangeReach as ChangeReachAnswer, ComponentReach, TokenEdit, ValueChange } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { useChangeReach } from './hooks/useChangeReach';
import { saidValue, valueTitle } from '../../src/shared/valueNames';
import { ChangeRow, ValueItem, ValueList } from '../../src/ui/ValueItem';
import { LinkButton } from '../../src/ui/LinkButton';
import { Message } from '../../src/ui/Message';
import { ListDisclosure } from '../../src/ui/Section';
import { Heading } from '../../src/ui/Heading';
import { asks } from './host';

const changeName = (c: ValueChange): string =>
	c.mode === 'dark' ? `${valueTitle(c.property, c.variant)} · dark` : valueTitle(c.property, c.variant);

export const Moved = ({ reach, name, here }: { reach: ComponentReach; name: string; here: boolean }) => (
	<div data-moved={reach.file} className="value-group">
		<Heading size="group">
			{here ? <span>{name}</span> : <LinkButton onPress={() => void asks().openComponent(reach.file)}>{name}</LinkButton>}
			{here && <span className="value-group-note">This one</span>}
		</Heading>
		<ValueList>
			{reach.changes.map((c) => (
				<ChangeRow
					key={`${c.mode}|${c.property}|${c.variant}|${c.from}|${c.to}`}
					name={changeName(c)}
					from={saidValue(c.property, c.from)}
					to={saidValue(c.property, c.to)}
				/>
			))}
			{reach.inside && (
				<ValueItem marks={{ 'data-value-inside': '' }}>
					<Message>Its stories draw differently, in a part its values do not read.</Message>
				</ValueItem>
			)}
		</ValueList>
	</div>
);

/**
 * At the bottom of the card of the change it is of: closed until pressed, then each component and what moved in it. What a
 * change moves is said in the stories drawn, never a claim about every use; `component` is whose tab it is in, if one.
 */
export const ReachView = ({
	reach,
	component,
	components,
}: {
	reach: Exclude<ChangeReachAnswer, { state: 'none' }>;
	component?: CatalogComponent;
	components: CatalogComponent[];
}) => {
	const names = new Map(components.map((c) => [c.id, c.name]));
	// Some that could not be drawn is said, since none affected is then not known; none affected and every one drawn is nothing to say.
	const note =
		reach.state === 'ready' && reach.notDrawn.length > 0 ? `${plural(reach.notDrawn.length, 'component')} did not draw, so cannot be said.` : null;
	if (reach.state === 'ready' && reach.moved.length === 0 && note === null) return null;
	return (
		<div data-reach>
			{reach.state === 'building' ? (
				<Message waiting>Thinking…</Message>
			) : reach.state === 'failed' ? (
				<Message size="block" tone="warning" title="What the change moves could not be drawn">
					{reach.error}
				</Message>
			) : reach.moved.length === 0 ? (
				<Message marks={{ 'data-reach-note': '' }}>{note}</Message>
			) : (
				<ListDisclosure label={`${plural(reach.moved.length, 'component')} affected`}>
					{reach.moved.map((m) => (
						<Moved key={m.file} reach={m} name={names.get(m.file) ?? m.file} here={m.file === component?.id} />
					))}
					{note !== null && <Message marks={{ 'data-reach-note': '' }}>{note}</Message>}
				</ListDisclosure>
			)}
		</div>
	);
};

export const ChangeReach = ({ edits, ...shown }: { edits: TokenEdit[]; components: CatalogComponent[] }) => {
	const reach = useChangeReach(edits);
	return reach.state === 'none' ? null : <ReachView reach={reach} {...shown} />;
};
