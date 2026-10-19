import type * as VsCode from 'vscode';
import type { Route } from '../../src/core/handle';
import type { DesignSystemsMemory } from '../../src/core/services/designSystem/designSystems';
import type { TokenEdit, TriedValue, WorkspaceApi } from '../../src/shared/contract';
import type { Theme } from '../../src/shared/prototypeTheme';
import type { Tell } from './agentWork';
import { type AskHandlers, readComponentArg } from './asks';
import { type Panels, receivePage } from './bridge';
import { CatalogShare } from './catalogShare';
import { componentLink, componentOf, editsAfterRead, keepMode, keptMode, libraryFileIn } from './designSystem';
import { DesignTabs } from './designTabs';
import { type AskName, type ComponentLink, SHARED_START, withTrial } from './messages';
import { dsnrPage } from './panel';
import type { LocalAddresses } from './html';

/**
 * The design system in VS Code (6.1, 6.2), wired: what its pages share, kept here for every page (`Shared`): the change to
 * its tokens being tried, the mode, the values tried, and its catalog, read once for all of them (`CatalogShare`); its
 * tabs in the editor, each DSNR's own page answered as the panel is (`receivePage`); what its pages ask (`handlers`, in the
 * extension's table of asks); and its commands, Open a component (given one by code, or chosen in VS Code's quick pick,
 * the natural form for one of many) and Open Primitives. What goes wrong is said (`failed`).
 */
export const designSystemHost = ({
	vscode,
	dist,
	api,
	panels,
	asks,
	systems,
	local,
	openVoiceAndTone,
	openChanges,
	openExternal,
	tell,
	failed,
	failedFor,
	onShown,
	kept,
}: {
	vscode: typeof VsCode;
	/** The extension's build, which its pages load from. */
	dist: VsCode.Uri;
	api: Pick<WorkspaceApi, 'designSystemCatalog' | 'designSystems' | 'onLibraryShown'>;
	panels: Panels;
	/** The extension's asks, which its tabs make as the panel does. */
	asks: () => ReadonlyMap<AskName, Route>;
	/** The design system the core shows, whose clone a token's file is in. */
	systems: Pick<DesignSystemsMemory, 'current'>;
	local: () => Promise<LocalAddresses>;
	openVoiceAndTone: () => Promise<void>;
	/** Shows the panel and its Changes dialog. */
	openChanges: () => Promise<void>;
	openExternal: (url: string) => Promise<void>;
	tell: Tell;
	failed: (err: unknown) => void;
	failedFor: (fromCode: boolean) => (err: unknown) => void;
	/** Told when a component's tab opens, closes, or is brought in front or covered. */
	onShown: () => void;
	/** VS Code's state for the extension, where the mode chosen is kept. */
	kept: Pick<VsCode.Memento, 'get' | 'update'>;
}) => {
	const edits = panels.share('tokenEdits', []);
	const mode = panels.share('mode', keptMode(kept), (next) => keepMode(kept, next));
	const values = panels.share('valueTrials', {});
	// The catalog every page shows, as the extension read it.
	const shownCatalog = panels.share('catalog', SHARED_START.catalog);
	const catalog = new CatalogShare({
		api,
		shared: shownCatalog,
		// What is tried is kept only on tokens the library still has (`editsAfterRead`).
		onRead: (read) => edits.set(editsAfterRead(edits.current(), read)),
	});
	const tabs = new DesignTabs({
		create: (title) =>
			vscode.window.createWebviewPanel('dsnr.designSystem', title, vscode.ViewColumn.Active, {
				enableScripts: true,
				localResourceRoots: [dist],
				// Its stories stay drawn while another tab is in front, rather than being built and drawn again.
				retainContextWhenHidden: true,
			}),
		page: async (webview, tab) => dsnrPage(webview as VsCode.Webview, dist, await local(), tab),
		panels,
		onShown,
		receive: (webview, raw) => receivePage(panels, webview, raw, asks(), failed),
	});
	const handlers = {
		openComponent: async (id: string) => {
			const component = componentOf(shownCatalog.current().catalog, id);
			await tabs.open({ kind: 'component', id: component.id, name: component.name });
		},
		componentLink: (id: string, link: ComponentLink) => openExternal(componentLink(componentOf(shownCatalog.current().catalog, id), link)),
		openPrimitives: () => tabs.open({ kind: 'primitives' }),
		openVoiceAndTone,
		// A file of the design system, as the person's clone has it, at its line: a token's, or where a value is written.
		openLibrarySource: async (file: string, line: number) => {
			const system = systems.current();
			const path = system === null ? null : libraryFileIn(system, file);
			if (path === null) throw new Error(`${file} is not a file of the design system shown.`);
			const at = new vscode.Position(line - 1, 0);
			await vscode.window.showTextDocument(vscode.Uri.file(path), { selection: new vscode.Range(at, at), preview: true });
		},
		setTokenEdits: (next: TokenEdit[]) => edits.set(next),
		// Values tried in one mode are not left on the other (the same instances draw another colour there).
		setMode: (next: Theme) => {
			if (next !== mode.current()) values.set({});
			mode.set(next);
		},
		setValueTrial: (file: string, commit: string, tried: TriedValue[]) => values.set(withTrial(values.current(), file, commit, tried)),
		openChanges,
		syncDesignSystem: () => catalog.sync(),
	} satisfies Partial<AskHandlers>;
	/** A component of the design system shown, chosen from its catalog (the one every page shows) in VS Code's quick pick, by its story file. */
	const pickComponent = async (): Promise<string | undefined> => {
		const shown = shownCatalog.current().catalog;
		if (shown?.state !== 'ready') return void tell('There is no design system shown here: the Design System tab says why.');
		const items = shown.components.map((c) => ({ label: c.name, description: c.group, id: c.id }));
		return (await vscode.window.showQuickPick(items, { placeHolder: 'Open a component', matchOnDescription: true }))?.id;
	};
	return {
		handlers,
		/** The components whose tab is in front. */
		shownComponents: () => tabs.shownComponents(),
		/** The design system shown is read for every page: the first found, once VS Code has found it. */
		read: () => catalog.start(),
		/**
		 * Another design system is shown: no change is being tried on it, the last one's components' tabs are closed, and it
		 * is read for every page.
		 */
		anotherShown: () => {
			edits.set([]);
			values.set({});
			tabs.closeComponents();
			void catalog.start();
		},
		disposables: [
			// A component in its own tab: given one by its story file, by code, or chosen from the design system shown.
			vscode.commands.registerCommand('dsnr.openComponent', async (raw: unknown) => {
				if (raw !== undefined) {
					const id = readComponentArg(raw);
					if (id === null) throw new Error('DSNR: Open a component was given something that is not a component.');
					return handlers.openComponent(id).catch(failedFor(true));
				}
				const picked = await pickComponent().catch(failed);
				if (picked) await handlers.openComponent(picked).catch(failed);
			}),
			vscode.commands.registerCommand('dsnr.openPrimitives', () => handlers.openPrimitives().catch(failed)),
		],
	};
};
