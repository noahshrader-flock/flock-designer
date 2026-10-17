import type { CatalogComponent, ValuePlace } from '../../src/shared/contract';
import { useTokenChanges } from '../../src/renderer/tokenChanges';
import { useComponentTokens } from '../../src/renderer/useComponentTokens';
import { useValueBranch } from '../../src/renderer/useValueBranch';
import { useValueSources } from '../../src/renderer/useValueSources';
import { labelOf } from '../../src/shared/tokens';
import { useTrying } from './useTrying';
import { ChangedValues } from './ValueChanges';
import { useValueTrials } from './valueTrials';

/**
 * One component's changes in the panel's Changes dialog (the changes being tried, DESIGN_SYSTEM.md): the values tried on
 * it, from its tab, where each is written, what writing them moves, and its branch, with Save, Propose and Start over: the
 * same as its tab has, by its name, among the others'. Its values are named as its drawing reads them
 * (`useComponentTokens`, kept by the core for each commit); where each is written is found once by the core however many
 * ask. A branch kept with nothing tried puts its values back, as opening its tab does.
 */
export const ComponentChanges = ({
	component,
	components,
	commit,
	onSource,
	onOpen,
}: {
	component: CatalogComponent;
	components: CatalogComponent[];
	/** The library's commit shown: values tried on another are not this one's to list. */
	commit: string;
	onSource: (place: ValuePlace) => void;
	onOpen: (id: string) => void;
}) => {
	const trying = useTrying(useValueTrials(), component.id, commit);
	const tried = [...trying.tried.values()];
	const { answer } = useComponentTokens(component.id);
	const sources = useValueSources(component.id, tried, trying.writes);
	const controls = useValueBranch(component.id, tried, trying.onAll);
	const { byPath } = useTokenChanges();
	const tokenName = (path: string) => {
		const t = byPath.get(path);
		return t ? labelOf(t) : path;
	};
	return (
		<ChangedValues
			name={component.name}
			component={component}
			components={components}
			rows={answer.state === 'ready' && answer.values.state === 'read' ? answer.values.rows.light : null}
			trying={trying}
			tokenName={tokenName}
			onSource={onSource}
			onOpen={onOpen}
			sources={sources}
			controls={controls}
		/>
	);
};
