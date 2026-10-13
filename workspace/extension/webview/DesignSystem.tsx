import type { CatalogComponent } from '../../src/shared/domain/designSystem';
import { plural } from '../../src/shared/plural';
import type { SampleDesignSystem } from './fixtures';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';
import { List } from './ui/List';
import { Row } from './ui/Row';
import { Section } from './ui/Section';
import { vscode } from './vscode';

/** Components by their group, in the order the library lists them. */
const byGroup = (components: CatalogComponent[]): [string, CatalogComponent[]][] => {
	const groups = new Map<string, CatalogComponent[]>();
	for (const c of components) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
	return [...groups];
};

/**
 * The Design System tab: the components under a section for each group, and the tokens last. With no design system found,
 * what DSGN looked for and where (ELECTRON_MIGRATION_PLAN, §1.6).
 */
export const DesignSystem = ({ system }: { system: SampleDesignSystem | null }) => {
	if (!system)
		return (
			<EmptyState icon="symbol-color" title="No design system found">
				<p>
					DSGN looks in the folders open in this window for a design system: the one the product names in its <code>.dsnr/workspace.json</code>, or
					any folder with stories or tokens.
				</p>
				<Button onClick={() => vscode().postMessage({ type: 'locate-design-system' })}>Locate design system…</Button>
			</EmptyState>
		);
	return (
		<>
			{byGroup(system.components).map(([group, components]) => (
				<Section key={group} title={group} count={components.length}>
					<List label={group}>
						{components.map((c) => (
							<Row key={c.id} start={<Icon name="symbol-misc" className="row-icon" />} name={c.name} />
						))}
					</List>
				</Section>
			))}
			<Section title="Tokens" count={system.tokens.length}>
				<List label="Tokens">
					{system.tokens.map((t) => (
						<Row key={t.category} start={<Icon name={t.icon} className="row-icon" />} name={t.category} meta={plural(t.count, 'token')} />
					))}
				</List>
			</Section>
		</>
	);
};
