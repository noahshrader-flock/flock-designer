import type { CatalogComponent, ChangeReach as ChangeReachAnswer, ComponentReach, TokenEdit, ValueChange } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { useChangeReach } from './hooks/useChangeReach';
import { saidValue, valueTitle } from '../../src/shared/valueNames';
import { ChangeRow, ValueItem, ValueList } from '../../src/ui/ValueItem';
import { LinkButton } from '../../src/ui/LinkButton';
import { Message } from '../../src/ui/Message';
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

/** Counted in the stories drawn, never a claim about every use; `title` names which change it is, `component` whose tab it is in. */
export const ReachView = ({
	reach,
	title,
	component,
	components,
}: {
	reach: Exclude<ChangeReachAnswer, { state: 'none' }>;
	title: string;
	component?: CatalogComponent;
	components: CatalogComponent[];
}) => {
	const names = new Map(components.map((c) => [c.id, c.name]));
	return (
		<section aria-label={title} className="aside-section">
			<Heading size="part">{title}</Heading>
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
						<Moved key={m.file} reach={m} name={names.get(m.file) ?? m.file} here={m.file === component?.id} />
					))}
				</>
			)}
		</section>
	);
};

export const ChangeReach = ({ edits, ...shown }: { edits: TokenEdit[]; components: CatalogComponent[] }) => {
	const reach = useChangeReach(edits);
	return reach.state === 'none' ? null : <ReachView reach={reach} title="Moved by the change" {...shown} />;
};
