import type { CatalogComponent, TriedValue, ValuePlace, ValueRow, ValueSource, ValueSources as ValueSourcesAnswer } from '../../src/shared/contract';
import type { BranchControls } from './hooks/useChangeBranch';
import { cellFor, triedId } from '../../src/shared/contract';
import { saidValue, valueTitle } from '../../src/shared/valueNames';
import type { HandOverControls } from './hooks/useHandOver';
import { BranchActions, ChangesGroup } from './Changed';
import type { Placing } from './branchButtons';
import { ReachView } from './ChangeReach';
import type { Trying } from './ComponentValues';
import { ChangeRow } from '../../src/ui/ValueItem';
import { LinkButton } from '../../src/ui/LinkButton';
import { Message } from '../../src/ui/Message';
import { asks } from './host';

/** Each place is one link, its file and its line, opening the library there: no words to say what it is. */
const Places = ({ places, by }: { places: ValuePlace[]; by?: 'agent' }) => (
	<span className="value-place" data-value-places>
		{by === 'agent' && <span className="value-place-line quiet">By the agent:</span>}
		{places.map((p) => (
			<span key={`${p.file}:${p.line}`} className="value-place-line">
				<LinkButton onPress={() => void asks().openLibrarySource(p.file, p.line)}>{`${p.file} (${p.line})`}</LinkButton>
			</span>
		))}
	</span>
);

const Said = ({ source, onWrite }: { source: ValueSource | null | undefined; onWrite: () => void }) => {
	if (source === undefined) return null;
	if (source === null || source.state === 'writing')
		return <span className="value-place quiet">{source === null ? 'Finding where it is written…' : 'The agent is writing it…'}</span>;
	if (source.state === 'refused')
		return (
			<>
				<span className="value-place warning-text" data-value-refused>
					{source.why}
				</span>
				{source.agent && (
					<span className="value-place">
						<LinkButton marks={{ 'data-value-agent': '' }} onPress={onWrite}>
							{source.agent === 'follow' ? 'Have the agent make it follow the token' : 'Have the agent write it'}
						</LinkButton>
					</span>
				)}
			</>
		);
	if (source.places.length === 0) return <span className="value-place quiet">As the library draws it: nothing to write.</span>;
	return (
		<>
			<Places places={source.places} by={source.by} />
			{source.said && <span className="value-place quiet">{source.said}</span>}
		</>
	);
};

/** Said only where the button is not the one a person expects: Process changes in Save's place. */
const CANNOT = 'DSNR cannot write every value where it is written, so the agent writes the change: Process changes hands it over.';

/**
 * With none tried (a branch kept, put back as the library draws it) nothing needs a place. Otherwise each value
 * must have its place: still looked for (or the agent writing one) is not a refusal yet, and one with none is.
 */
const placingOf = (tried: number, sources: ValueSourcesAnswer): Placing => {
	if (tried === 0) return 'found';
	if (sources.state === 'failed') return 'cannot';
	if (sources.state !== 'ready') return 'finding';
	if (sources.values.some((v) => v.state === 'writing')) return 'finding';
	return sources.values.every((v) => v.state === 'found') ? 'found' : 'cannot';
};

interface Shown {
	component: CatalogComponent;
	components: CatalogComponent[];
	/** Its values in light, as read. */
	rows: ValueRow[] | null;
	trying: Trying;
	tokenName: (path: string) => string;
}

export const ChangedValues = ({
	component,
	components,
	rows,
	trying,
	tokenName,
	name,
	sources,
	controls,
	handOver,
}: Shown & { name?: string; sources: ValueSourcesAnswer; controls: BranchControls<TriedValue[]>; handOver: HandOverControls }) => {
	const tried = [...trying.tried.values()];
	if (tried.length === 0 && controls.branch === null && handOver.branch === null) return null;
	const sourceOf = (t: TriedValue): ValueSource | null =>
		sources.state === 'ready' ? (sources.values.find((v) => v.id === triedId(t)) ?? null) : null;

	const placing = placingOf(tried.length, sources);
	return (
		<ChangesGroup
			label={name ? `Value changes · ${name}` : 'Value changes'}
			title={name ?? 'Styles'}
			count={tried.length}
			onReset={() => trying.onAll([])}
			marks={{ 'data-value-changes': '' }}
			rows={tried.map((t) => {
				const cell = cellFor(rows, t);
				return (
					<ChangeRow
						key={triedId(t)}
						marks={{ 'data-value-change': triedId(t) }}
						name={valueTitle(t.property, cell?.variant ?? null)}
						from={cell ? saidValue(t.property, cell.value) : ''}
						to={t.follows === undefined ? saidValue(t.property, t.value) : `follows ${tokenName(t.follows)}`}
						under={<Said source={sources.state === 'failed' ? undefined : sourceOf(t)} onWrite={() => trying.onWrite(t)} />}
						onReset={() => trying.onTry(triedId(t), null)}
					/>
				);
			})}
		>
			{placing === 'cannot' && tried.length > 0 && handOver.branch === null && <Message>{CANNOT}</Message>}
			<Message tone="error">{trying.writeError}</Message>
			{sources.state === 'failed' && (
				<Message size="block" tone="warning" title="Where its values are written could not be found">
					{sources.error}
				</Message>
			)}
			<BranchActions controls={controls} handOver={handOver} placing={placing} />
			{sources.state === 'ready' && sources.reach.state !== 'none' && (
				<ReachView reach={sources.reach} component={component} components={components} />
			)}
		</ChangesGroup>
	);
};
