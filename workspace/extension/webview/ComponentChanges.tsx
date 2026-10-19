import type { CatalogComponent } from '../../src/shared/contract';
import { useTokenChanges } from './hooks/tokenChanges';
import { useComponentTokens } from './hooks/useComponentTokens';
import { useHandOver } from './hooks/useHandOver';
import { useChangeBranch } from './hooks/useChangeBranch';
import { useValueSources } from './hooks/useValueSources';
import { labelOf } from '../../src/shared/tokens';
import { useTrying } from './useTrying';
import { ChangedValues } from './ValueChanges';
import { useValueTrials } from './shared';

/** A branch kept with nothing tried puts its values back, as opening its tab does. */
export const ComponentChanges = ({
	component,
	components,
	commit,
}: {
	component: CatalogComponent;
	components: CatalogComponent[];
	/** The library's commit shown: values tried on another are not this one's to list. */
	commit: string;
}) => {
	const trying = useTrying(useValueTrials(), component.id, commit);
	const tried = [...trying.tried.values()];
	const { answer } = useComponentTokens(component.id);
	const sources = useValueSources(component.id, tried, trying.writes);
	const controls = useChangeBranch('values', { shown: component.id, scope: component.id, change: tried, setChange: trying.onAll });
	const handOver = useHandOver({ shown: component.id, file: component.id, change: { tried }, watch: true });
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
			sources={sources}
			controls={controls}
			handOver={handOver}
		/>
	);
};
