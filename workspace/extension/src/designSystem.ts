import { resolve, sep } from 'node:path';
import type * as VsCode from 'vscode';
import type { Context } from '../../src/core/services/projects/findContext';
import { type DesignSystemsMemory, systemAt } from '../../src/core/services/designSystem/designSystems';
import type { Catalog, CatalogComponent, ConnectedDesignSystem, TokenEdit } from '../../src/shared/contract';
import { editsKept } from '../../src/shared/tokens';
import { errorText } from '../../src/shared/result';
import { DEFAULT_THEME, type Theme, isTheme } from '../../src/shared/prototypeTheme';
import type { ComponentLink } from './messages';

const same = (a: ConnectedDesignSystem, b: ConnectedDesignSystem): boolean =>
	(Object.keys(a) as (keyof ConnectedDesignSystem)[]).every((k) => a[k] === b[k]);

/** Why the folder found cannot be read as a design system, or null (also when none was found). */
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

/** A branch handed to Claude Code, shown in the library's place, is not the library, so nothing tried is let go for it. */
export const editsAfterRead = (edits: TokenEdit[], read: Catalog): TokenEdit[] =>
	read.state === 'ready' && read.showing !== null ? edits : editsKept(edits, read);

const MODE = 'dsnr.mode';

export const keptMode = (kept: Pick<VsCode.Memento, 'get'>): Theme => {
	const mode = kept.get<unknown>(MODE);
	return isTheme(mode) ? mode : DEFAULT_THEME;
};
export const keepMode = (kept: Pick<VsCode.Memento, 'update'>, mode: Theme): void => void kept.update(MODE, mode);

export const componentOf = (catalog: Catalog | null, id: string): CatalogComponent => {
	const component = catalog?.state === 'ready' ? catalog.components.find((c) => c.id === id) : undefined;
	if (!component) throw new Error(`The design system shown has no component ${id}.`);
	return component;
};

export const componentLink = (component: CatalogComponent, link: ComponentLink): string => {
	if (link === 'source') return component.source;
	if (component.storybook === null)
		throw new Error(`${component.name} has no Storybook page DSNR knows: only a design system whose hosted Storybook it knows has one.`);
	return component.storybook;
};

/** `file` is from the repository's root; null when it resolves outside the clone. */
export const libraryFileIn = (system: Pick<ConnectedDesignSystem, 'root'>, file: string): string | null => {
	const path = resolve(system.root, file);
	return path.startsWith(system.root + sep) ? path : null;
};

/** When the one found cannot be read, the one the person located is shown instead: locating it is how they said which. */
export const shownFrom = async (
	found: Context['designSystem'],
	located: string | null,
	{ show, at }: { show: (found: Context['designSystem']) => Promise<string | null>; at: (root: string) => Promise<Context['designSystem']> },
): Promise<{ designSystem: Context['designSystem']; unreadable: string | null }> => {
	const why = await show(found);
	if (why === null || located === null || found?.how === 'located') return { designSystem: found, unreadable: why };
	const instead = await at(located);
	if (instead === null || (await show(instead)) !== null) return { designSystem: found, unreadable: why };
	return { designSystem: instead, unreadable: null };
};
