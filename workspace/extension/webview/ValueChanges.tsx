import type { CatalogComponent, TriedValue, ValuePlace, ValueRow, ValueSource, ValueSources as ValueSourcesAnswer } from '../../src/shared/contract';
import type { BranchControls } from '../../src/renderer/useChangeBranch';
import { triedId } from '../../src/shared/contract';
import { plural } from '../../src/shared/plural';
import { saidValue, valueTitle } from '../../src/shared/valueNames';
import { useValueBranch } from '../../src/renderer/useValueBranch';
import { useValueSources } from '../../src/renderer/useValueSources';
import { BranchActions } from './Changed';
import { ReachView } from './ChangeReach';
import type { Trying } from './ComponentValues';
import { IconButton } from './ui/IconButton';
import { Notice } from './ui/Notice';

/** Where a value is written, each place a link to its line: by file, its lines after it (`src/utils/theme.ts, lines 58, 70`). */
const Places = ({ places, onSource }: { places: ValuePlace[]; onSource: (place: ValuePlace) => void }) => {
	const files = [...new Set(places.map((p) => p.file))];
	return (
		<span className="value-place quiet" data-value-places>
			Written in{' '}
			{files.map((file, i) => {
				const here = places.filter((p) => p.file === file);
				return (
					<span key={file}>
						{i > 0 && '; '}
						{file}, {here.length === 1 ? 'line' : 'lines'}{' '}
						{here.map((p, j) => (
							<span key={p.line}>
								{j > 0 && ', '}
								<button type="button" className="link" onClick={() => onSource(p)}>
									{p.line}
								</button>
							</span>
						))}
					</span>
				);
			})}
		</span>
	);
};

/** What is said under a value: where it is written, that it is being found, or why it cannot be saved; nothing when finding failed. */
const Said = ({ source, onSource }: { source: ValueSource | null | undefined; onSource: (place: ValuePlace) => void }) => {
	if (source === undefined) return null;
	if (source === null) return <span className="value-place quiet">Finding where it is written…</span>;
	if (source.state === 'refused')
		return (
			<span className="value-place warning-text" data-value-refused>
				{source.why}
			</span>
		);
	if (source.places.length === 0) return <span className="value-place quiet">As the library draws it: nothing to write.</span>;
	return <Places places={source.places} onSource={onSource} />;
};

/**
 * The values tried on a component's instances, and saving them (Phase 4 of adjusting a component): each, from what it is
 * drawn as to what it is tried as, with where it is written in the library's source (each place opens at its line), found
 * as it is tried, or why it cannot be saved; Reset for each and for all; then Save, Propose and Start over on a branch of
 * the component's own, as a change to the tokens has (`BranchActions`). Save waits until every value is found and read back.
 * Then what writing them reaches (`ReachView`): a size table two components share moves both. Nothing while nothing is
 * tried and no branch is kept.
 */
export const ValueChanges = (shown: Shown) => {
	const tried = [...shown.trying.tried.values()];
	const sources = useValueSources(shown.component.id, tried);
	const controls = useValueBranch(shown.component.id, tried, shown.trying.onAll);
	return <ChangedValues {...shown} sources={sources} controls={controls} />;
};

interface Shown {
	component: CatalogComponent;
	components: CatalogComponent[];
	/** Its values in light, as read: what names each value tried and says what it was. */
	rows: ValueRow[] | null;
	trying: Trying;
	onSource: (place: ValuePlace) => void;
	onOpen: (id: string) => void;
}

/** The values tried, where each is written, and their branch (`ValueChanges`), as found and as kept. */
export const ChangedValues = ({
	component,
	components,
	rows,
	trying,
	onSource,
	onOpen,
	sources,
	controls,
}: Shown & { sources: ValueSourcesAnswer; controls: BranchControls<TriedValue[]> }) => {
	const tried = [...trying.tried.values()];
	if (tried.length === 0 && controls.branch === null) return null;
	const sourceOf = (t: TriedValue): ValueSource | null =>
		sources.state === 'ready' ? (sources.values.find((v) => v.id === triedId(t)) ?? null) : null;
	const cellOf = (t: TriedValue) => rows?.find((r) => r.property === t.property)?.cells.find((c) => c.targets.join() === t.targets.join());
	const savable = sources.state === 'ready' && sources.values.every((v) => v.state === 'found');
	return (
		<>
			<section aria-label="Changed values" data-value-changes className="changed">
				<div className="changed-header">
					<span className="changed-title">
						Changed values <span className="section-count">{tried.length}</span>
					</span>
					{tried.length > 0 && (
						<button type="button" className="link" onClick={() => trying.onAll([])}>
							Reset all
						</button>
					)}
				</div>
				{tried.length === 0 ? (
					<p className="quiet">Every value is as the library draws it.</p>
				) : (
					<ul className="tokens">
						{tried.map((t) => {
							const cell = cellOf(t);
							const name = valueTitle(t.property, cell?.variant ?? null);
							return (
								<li key={triedId(t)} data-value-change={triedId(t)} className="token">
									<span className="value-cell value-change">
										<span className="value-label">{name}</span>
										<span className="value-drawn">
											<span>{cell ? saidValue(t.property, cell.value) : ''}</span> <span>→ {saidValue(t.property, t.value)}</span>
										</span>
									</span>
									<Said source={sources.state === 'failed' ? undefined : sourceOf(t)} onSource={onSource} />
									<span className="item-actions">
										<IconButton size="small" icon="discard" label={`Reset ${name}`} onClick={() => trying.onTry(triedId(t), null)} />
									</span>
								</li>
							);
						})}
					</ul>
				)}
				{tried.length > 0 && (
					<p className="quiet">
						{savable
							? `Saving writes ${plural(tried.length, 'value')} where ${tried.length === 1 ? 'it is' : 'they are'} written, and nothing else.`
							: 'Tried in its stories, on its own instances. A value is saved once where it is written is found.'}
					</p>
				)}
				<BranchActions controls={controls} canSave={savable} />
			</section>
			{sources.state === 'failed' && <Notice title="Where its values are written could not be found">{sources.error}</Notice>}
			{sources.state === 'ready' && sources.reach.state !== 'none' && (
				<ReachView reach={sources.reach} title="Moved by these values" component={component} components={components} onOpen={onOpen} />
			)}
		</>
	);
};
