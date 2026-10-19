import { type ReactNode, useEffect } from 'react';
import type { CatalogComponent, TriedValue, ValuePlace, ValueRow, ValueSource, ValueSources as ValueSourcesAnswer } from '../../src/shared/contract';
import type { BranchControls } from './hooks/useChangeBranch';
import { cellFor, triedId } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { saidValue, valueTitle } from '../../src/shared/valueNames';
import { type HandOverControls, useHandOver } from './hooks/useHandOver';
import { useChangeBranch } from './hooks/useChangeBranch';
import { useValueSources } from './hooks/useValueSources';
import { BranchActions } from './Changed';
import { ReachView } from './ChangeReach';
import type { Trying } from './ComponentValues';
import { ChangeRow, ValueList } from './ui/ValueItem';
import { LinkButton } from './ui/LinkButton';
import { Message } from './ui/Message';

/**
 * Where a value is written, each place a link to its line: by file, its lines after it (`src/utils/theme.ts, lines 58,
 * 70`); by whom, when the agent wrote it.
 */
const Places = ({ places, by, onSource }: { places: ValuePlace[]; by?: 'agent'; onSource: (place: ValuePlace) => void }) => {
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
								<LinkButton onPress={() => onSource(p)}>{p.line}</LinkButton>
							</span>
						))}
					</span>
				);
			})}
		</span>
	);
};

/**
 * What is said under a value: where it is written (and, when the agent wrote it, why it wrote it so), that it is being found
 * or written, or why it cannot be saved, with the agent offered where it can write it (Phase 4.5, 4.6); nothing when
 * finding failed.
 */
const Said = ({
	source,
	onSource,
	onWrite,
}: {
	source: ValueSource | null | undefined;
	onSource: (place: ValuePlace) => void;
	onWrite: () => void;
}) => {
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
			<Places places={source.places} by={source.by} onSource={onSource} />
			{source.said && <span className="value-place quiet">{source.said}</span>}
		</>
	);
};

/**
 * The values tried on a component's instances, and saving them (Phase 4 of adjusting a component): each, from what it is
 * drawn as to what it is tried as, with where it is written in the library's source (each place opens at its line), found
 * as it is tried, or why it cannot be saved; Reset for each and for all; then Save, Propose and Start over on a branch of
 * the component's own, or Process changes, as a change to the tokens has (`BranchActions`), in the panel's Changes
 * (`onActions` on its tab, which opens them there). Save waits until every value is found and read back.
 * Then what writing them reaches (`ReachView`): a size table two components share moves both. Nothing while nothing is
 * tried and no branch is kept or handed over. Where each is written and the branch are found while the tab is open (a
 * branch's values are put back when it opens), whether or not the Changes dialog is: what it draws is handed to the dialog
 * (`children`).
 */
export const ValueChanges = ({
	children,
	onKept,
	...shown
}: Shown & {
	children: (values: ReactNode) => ReactNode;
	/**
	 * Told whether it has a branch kept or handed over, so its Changes button can still be pressed with nothing tried, to
	 * propose or leave it.
	 */
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
	/** Its values in light, as read: what names each value tried and says what it was. */
	rows: ValueRow[] | null;
	trying: Trying;
	/** A token's name, by its path: what a value made to follow one says it follows. */
	tokenName: (path: string) => string;
	onSource: (place: ValuePlace) => void;
	onOpen: (id: string) => void;
	/**
	 * Where Save, Process changes, Propose and Start over are when not here (the changes being tried, DESIGN_SYSTEM.md): on
	 * a component's tab they are in the panel's Changes, which this opens; in the panel, where every change is, they are
	 * here (none given).
	 */
	onActions?: () => void;
}

/**
 * The values tried, where each is written, and their branch (`ValueChanges`), as found and as kept: titled Styles on its own
 * tab, and by the component's name (`name`) in the panel's Changes, among the others'.
 */
export const ChangedValues = ({
	component,
	components,
	rows,
	trying,
	tokenName,
	onSource,
	onOpen,
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
			<section aria-label={name ? `Value changes · ${name}` : 'Value changes'} data-value-changes className="changed">
				<div className="changed-header">
					<span className="changed-title">
						{name ?? 'Styles'} <span className="section-count">{tried.length}</span>
					</span>
					{tried.length > 0 && <LinkButton onPress={() => trying.onAll([])}>Reset all</LinkButton>}
				</div>
				{tried.length === 0 ? (
					<Message>Every value is as the library draws it.</Message>
				) : (
					<ValueList>
						{tried.map((t) => {
							const cell = cellFor(rows, t);
							return (
								<ChangeRow
									key={triedId(t)}
									marks={{ 'data-value-change': triedId(t) }}
									name={valueTitle(t.property, cell?.variant ?? null)}
									from={cell ? saidValue(t.property, cell.value) : ''}
									to={t.follows === undefined ? saidValue(t.property, t.value) : `follows ${tokenName(t.follows)}`}
									under={<Said source={sources.state === 'failed' ? undefined : sourceOf(t)} onSource={onSource} onWrite={() => trying.onWrite(t)} />}
									onReset={() => trying.onTry(triedId(t), null)}
								/>
							);
						})}
					</ValueList>
				)}
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
			</section>
			{sources.state === 'failed' && (
				<Message size="block" tone="warning" title="Where its values are written could not be found">
					{sources.error}
				</Message>
			)}
			{sources.state === 'ready' && sources.reach.state !== 'none' && (
				<ReachView reach={sources.reach} title="Moved by these values" component={component} components={components} onOpen={onOpen} />
			)}
		</>
	);
};
