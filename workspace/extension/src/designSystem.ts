import { resolve, sep } from 'node:path';
import type { Context } from '../../src/main/services/findContext';
import { type DesignSystemsMemory, systemAt } from '../../src/main/services/designSystems';
import type { CatalogComponent, ConnectedDesignSystem, TokenEdit, WorkspaceApi } from '../../src/shared/contract';
import { errorText, valueOf } from '../../src/shared/result';
import { sameChange } from '../../src/shared/tokens';
import type { ComponentLink, HostMessage } from './messages';

const same = (a: ConnectedDesignSystem, b: ConnectedDesignSystem): boolean =>
	(Object.keys(a) as (keyof ConnectedDesignSystem)[]).every((k) => a[k] === b[k]);

/**
 * The design system VS Code found, told to the core as the one shown (ELECTRON_MIGRATION_PLAN 6.1): the core reads,
 * previews, pictures and changes the one it is told is shown, as it does the app's connected one, so the folder found is
 * read as connecting it would keep it (`systemAt`) and kept, only when it differs from the one shown. Says why when the
 * folder cannot be read that way; null otherwise, and when none was found.
 */
export const showFound = async (
	memory: Pick<DesignSystemsMemory, 'current' | 'add'>,
	found: Context['designSystem'],
	read: (root: string) => Promise<ConnectedDesignSystem> = systemAt,
): Promise<string | null> => {
	if (found === null) return null;
	let system: ConnectedDesignSystem;
	try {
		system = await read(found.root);
	} catch (err) {
		return errorText(err);
	}
	const shown = memory.current();
	if (shown === null || !same(shown, system)) memory.add(system);
	return null;
};

/**
 * The change to the tokens being tried (ELECTRON_MIGRATION_PLAN 6.2), kept by the extension rather than one page: the
 * panel makes it, and every DSNR page is told it (`post`), so a component's tab builds its stories with it, and a panel
 * loaded again finds it as it was. Told only when it changes; none when another design system is shown.
 */
export class TokenTrial {
	private edits: TokenEdit[] = [];

	constructor(private readonly post: (message: Extract<HostMessage, { type: 'token-edits' }>) => void) {}

	current(): TokenEdit[] {
		return this.edits;
	}

	set(edits: TokenEdit[]): void {
		if (sameChange(edits, this.edits)) return;
		this.edits = edits;
		this.post({ type: 'token-edits', edits });
	}
}

/** The component of the design system shown with this story file, as its catalog lists it now; refused for any other. */
export const componentOf = async (api: Pick<WorkspaceApi, 'designSystemCatalog'>, id: string): Promise<CatalogComponent> => {
	const catalog = valueOf(await api.designSystemCatalog(false));
	const component = catalog.state === 'ready' ? catalog.components.find((c) => c.id === id) : undefined;
	if (!component) throw new Error(`The design system shown has no component ${id}.`);
	return component;
};

/** Where a component's link goes, found from the catalog: its Storybook docs, which only a hosted Storybook has, or its source. */
export const componentLink = (component: CatalogComponent, link: ComponentLink): string => {
	if (link === 'source') return component.source;
	if (component.storybook === null)
		throw new Error(`${component.name} has no Storybook page DSNR knows: only a design system whose hosted Storybook it knows has one.`);
	return component.storybook;
};

/**
 * A token's own file in the design system's clone, as the person has it, or null when the path is not one of its files: a
 * path from its repository's root (as tokens are read), and nothing outside it.
 */
export const tokenFileIn = (system: Pick<ConnectedDesignSystem, 'root'>, file: string): string | null => {
	const path = resolve(system.root, file);
	return path.startsWith(system.root + sep) ? path : null;
};
