import { type ReactNode, useEffect } from 'react';
import type { CatalogComponent, TriedValue, ValuePlace, ValueRow, ValueSource, ValueSources as ValueSourcesAnswer } from '../../src/shared/contract';
import type { BranchControls } from './hooks/useChangeBranch';
import { cellFor, triedId } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { saidValue, valueTitle } from '../../src/shared/valueNames';
import { type HandOverControls, useHandOver } from './hooks/useHandOver';
import { useChangeBranch } from './hooks/useChangeBranch';
import { useValueSources } from './hooks/useValueSources';
import { BranchActions, ChangesGroup } from './Changed';
import { ReachView } from './ChangeReach';
import type { Trying } from './ComponentValues';
import { ChangeRow } from '../../src/ui/ValueItem';
import { LinkButton } from '../../src/ui/LinkButton';
import { Message } from '../../src/ui/Message';
import { asks } from './host';

const Places = ({ places, by }: { places: ValuePlace[]; by?: 'agent' }) => {
	const files = [...new Set(places.map((p) => p.file))];
	return (
		<span className="value-place quiet" data-value-places>
			{by === 'agent' ? 'Written by the agent in' : 'Written in'}{' '}
			{files.map((file, i) => {
				const here = places.filter((p) => p.file === file);
				return (
					<span key={file}>
						{i > 0 && '; '}
						{file}, {here.length === 1 ? 'line' : 'lines'}{' '}
						{here.map((p, j) => (
							<span key={p.line}>
								{j > 0 && ', '}
								<LinkButton onPress={() => void asks().openLibrarySource(p.file, p.line)}>{p.line}</LinkButton>
							</span>
						))}
					</span>
				);
			})}
		</span>
	);
};

const Said = ({ source, onWrite }: { source: ValueSource | null | undefined; onWrite: () => void }) => {
	if (source === undefined) return null;
	if (source === null) return <span className="value-place quiet">Finding where it is written…</span>;
	if (source.state === 'writing') return <span className="value-place quiet">The agent is writing it…</span>;
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

/** Found while the tab is open, whether or not the dialog is: what it draws is handed to it (`children`). Save waits until every value is found. */
export const ValueChanges = ({
	children,
	onKept,
	...shown
}: Shown & {
	children: (values: ReactNode) => ReactNode;
	/** Told whether a branch is kept or handed over, so its Changes button can still be pressed with nothing tried. */
	onKept: (kept: boolean) => void;
}) => {
	const tried = [...shown.trying.tried.values()];
	const sources = useValueSources(shown.component.id, tried, shown.trying.writes);
	const controls = useChangeBranch('values', { shown: shown.component.id, scope: shown.component.id, change: tried, setChange: shown.trying.onAll });
	// Read once, not watched: what is done with a hand-over is in the panel's Changes.
	const handOver = useHandOver({ shown: shown.component.id, file: shown.component.id, change: { tried }, watch: false });
	const kept = controls.branch !== null || handOver.branch !== null;
	useEffect(() => onKept(kept), [kept, onKept]);
	return children(<ChangedValues {...shown} sources={sources} controls={controls} handOver={handOver} />);
};

interface Shown {
	component: CatalogComponent;
	components: CatalogComponent[];
	/** Its values in light, as read. */
	rows: ValueRow[] | null;
	trying: Trying;
	tokenName: (path: string) => string;
	/** On a component's tab, opens the panel's Changes, where Save, Propose and Start over are; not given in the panel, which has them here. */
	onActions?: () => void;
}

export const ChangedValues = ({
	component,
	components,
	rows,
	trying,
	tokenName,
	onActions,
	name,
	sources,
	controls,
	handOver,
}: Shown & { name?: string; sources: ValueSourcesAnswer; controls: BranchControls<TriedValue[]>; handOver: HandOverControls }) => {
	const tried = [...trying.tried.values()];
	if (tried.length === 0 && controls.branch === null && handOver.branch === null) return null;
	const sourceOf = (t: TriedValue): ValueSource | null =>
		sources.state === 'ready' ? (sources.values.find((v) => v.id === triedId(t)) ?? null) : null;

	// Every value found where it is written; or none tried on a branch kept, which a save puts back as the library draws it.
	const savable = tried.length === 0 ? controls.branch !== null : sources.state === 'ready' && sources.values.every((v) => v.state === 'found');
	return (
		<>
			<ChangesGroup
				label={name ? `Value changes · ${name}` : 'Value changes'}
				title={name ?? 'Styles'}
				count={tried.length}
				onResetAll={() => trying.onAll([])}
				empty="Every value is as the library draws it."
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
				{tried.length > 0 && handOver.branch === null && (
					<Message>
						{savable
							? `Saving writes ${plural(tried.length, 'value')} where ${tried.length === 1 ? 'it is' : 'they are'} written, and nothing else.`
							: 'Tried in its stories, on its own instances. A value is saved once where it is written is found, or the agent has written it.'}
					</Message>
				)}
				<Message tone="error">{trying.writeError}</Message>
				{onActions ? (
					<LinkButton marks={{ 'data-actions-elsewhere': '' }} onPress={onActions}>
						Save or process changes in the side panel
					</LinkButton>
				) : (
					<BranchActions controls={controls} handOver={handOver} canSave={savable} />
				)}
			</ChangesGroup>
			{sources.state === 'failed' && (
				<Message size="block" tone="warning" title="Where its values are written could not be found">
					{sources.error}
				</Message>
			)}
			{sources.state === 'ready' && sources.reach.state !== 'none' && (
				<ReachView reach={sources.reach} title="Moved by these values" component={component} components={components} />
			)}
		</>
	);
};
