import type { CatalogComponent } from '../../src/shared/domain/designSystem';
import { plural } from '../../src/shared/plural';
import type { Context } from '../../src/main/services/findContext';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { Icon } from './ui/Icon';
import { List } from './ui/List';
import { Row } from './ui/Row';
import { Section } from './ui/Section';

/** Components by their group, in the order the library lists them. */
const byGroup = (components: CatalogComponent[]): [string, CatalogComponent[]][] => {
	const groups = new Map<string, CatalogComponent[]>();
	for (const c of components) groups.set(c.group, [...(groups.get(c.group) ?? []), c]);
	return [...groups];
};

/** A design system's components and tokens, read from it: what the tab lists once that is built (Phase 6). */
export interface Catalog {
	components: CatalogComponent[];
	tokens: { category: string; count: number; icon: string }[];
}

/** How the design system was found, said as the person would. */
const HOW: Record<NonNullable<Context['designSystem']>['how'], string> = {
	named: 'Named by the product',
	open: 'Open in this window',
	located: 'Located by you',
};

/** A folder's own name, from its path. */
const folderName = (path: string): string => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;

/**
 * The Design System tab: the design system found (ELECTRON_MIGRATION_PLAN, §1.6) and how, then its components under a
 * section for each group and its tokens last, once those are read (`catalog`). With none found, what DSNR looked for and
 * where, and Locate design system.
 */
export const DesignSystem = ({ found, catalog, onLocate }: { found: Context['designSystem']; catalog?: Catalog; onLocate: () => void }) => {
	if (!found)
		return (
			<EmptyState icon="symbol-color" title="No design system found">
				<p>
					DSNR looks in the folders open in this window for a design system: the one the product names in its <code>.dsnr/workspace.json</code>, or
					any folder with stories or tokens.
				</p>
				<Button onClick={onLocate}>Locate design system…</Button>
			</EmptyState>
		);
	return (
		<>
			<Section title="Design system">
				<List label="Design system">
					<Row start={<Icon name="symbol-color" className="row-icon" />} name={folderName(found.root)} meta={HOW[found.how]} />
				</List>
			</Section>
			{catalog ? (
				<>
					{byGroup(catalog.components).map(([group, components]) => (
						<Section key={group} title={group} count={components.length}>
							<List label={group}>
								{components.map((c) => (
									<Row key={c.id} start={<Icon name="symbol-misc" className="row-icon" />} name={c.name} />
								))}
							</List>
						</Section>
					))}
					<Section title="Tokens" count={catalog.tokens.length}>
						<List label="Tokens">
							{catalog.tokens.map((t) => (
								<Row key={t.category} start={<Icon name={t.icon} className="row-icon" />} name={t.category} meta={plural(t.count, 'token')} />
							))}
						</List>
					</Section>
				</>
			) : (
				<p className="note">Its components and tokens come to DSNR in VS Code in a later update.</p>
			)}
		</>
	);
};
