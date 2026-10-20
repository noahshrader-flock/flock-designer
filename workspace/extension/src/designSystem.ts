import { resolve, sep } from 'node:path';
import type * as VsCode from 'vscode';
import type { Context } from '../../src/core/services/projects/findContext';
import { type DesignSystemsMemory, systemAt } from '../../src/core/services/designSystem/designSystems';
import type { Catalog, CatalogComponent, ConnectedDesignSystem, TokenEdit } from '../../src/shared/contract';
import { editsKept } from '../../src/shared/tokens';
import { errorText } from '../../src/shared/result';
import { storybookAddress } from '../../src/shared/catalog';
import { DEFAULT_THEME, type Theme, isTheme } from '../../src/shared/prototypeTheme';
import type { ComponentLink } from './messages';

/** By what a read of its folder says: an address given for it is the memory's to keep, not a change. */
const same = (kept: ConnectedDesignSystem, read: ConnectedDesignSystem): boolean =>
	(Object.keys(read) as (keyof ConnectedDesignSystem)[]).every((k) => kept[k] === read[k]);

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

/** A branch handed to an agent, shown in the library's place, is not the library, so nothing tried is let go for it. */
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
		throw new Error(`${component.name} has no Storybook page DSNR can name: its story file's title could not be read.`);
	return component.storybook;
};

/** A component's page, opened; its Storybook's address asked for when it is not known, then kept and every page read again. */
export const openComponentLink = async (
	component: CatalogComponent,
	link: ComponentLink,
	system: Pick<ConnectedDesignSystem, 'id' | 'name'> | null,
	d: {
		ask: (name: string) => Promise<string | null>;
		keep: (id: string, address: string) => void;
		reread: () => Promise<void>;
		open: (url: string) => Promise<void>;
	},
): Promise<void> => {
	if (link === 'storybook' && component.storybook === null && component.storybookPath !== null && system !== null) {
		const address = await d.ask(system.name);
		if (address === null) return;
		d.keep(system.id, address);
		await d.reread();
		return d.open(`${address}${component.storybookPath}`);
	}
	return d.open(componentLink(component, link));
};

/** Asked once, the first time a component is opened in Storybook: a library's files do not say where its Storybook is. */
export const askStorybook = async (window: Pick<typeof VsCode.window, 'showInputBox'>, name: string): Promise<string | null> => {
	const given = await window.showInputBox({
		title: `${name}'s Storybook`,
		prompt: 'Where its Storybook is published. DSNR keeps it with the design system, so it is asked only once.',
		placeHolder: 'https://storybook.example.com/',
		ignoreFocusOut: true,
		validateInput: (value) => (storybookAddress(value) === null ? 'A web address, starting with https://' : null),
	});
	return given === undefined ? null : storybookAddress(given);
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
