import type * as VsCode from 'vscode';
import type { Route } from '../../src/core/handle';
import type { DesignSystemsMemory } from '../../src/core/services/designSystem/designSystems';
import type { TokenEdit, TriedValue, WorkspaceApi } from '../../src/shared/contract';
import type { Theme } from '../../src/shared/prototypeTheme';
import type { Tell } from './say';
import { type AskHandlers, readComponentArg } from './asks';
import { type Panels, receivePage } from './bridge';
import { CatalogShare } from './catalogShare';
import { askStorybook, componentOf, editsAfterRead, keepMode, keptMode, libraryFileIn, openComponentLink } from './designSystem';
import { DesignTabs } from './designTabs';
import { type AskName, type ComponentLink, SHARED_START, withTrial } from './messages';
import { dsnrPage } from './panel';
import type { LocalAddresses } from './html';

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
	dist: VsCode.Uri;
	api: Pick<WorkspaceApi, 'designSystemCatalog' | 'designSystems' | 'onLibraryShown'>;
	panels: Panels;
	asks: () => ReadonlyMap<AskName, Route>;
	systems: Pick<DesignSystemsMemory, 'current' | 'setStorybook'>;
	local: () => Promise<LocalAddresses>;
	openVoiceAndTone: () => Promise<void>;
	openChanges: () => Promise<void>;
	openExternal: (url: string) => Promise<void>;
	tell: Tell;
	failed: (err: unknown) => void;
	failedFor: (fromCode: boolean) => (err: unknown) => void;
	onShown: () => void;
	kept: Pick<VsCode.Memento, 'get' | 'update'>;
}) => {
	const edits = panels.share('tokenEdits', []);
	const mode = panels.share('mode', keptMode(kept), (next) => keepMode(kept, next));
	const values = panels.share('valueTrials', {});
	const shownCatalog = panels.share('catalog', SHARED_START.catalog);
	const catalog = new CatalogShare({
		api,
		shared: shownCatalog,
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
		componentLink: (id: string, link: ComponentLink) =>
			openComponentLink(componentOf(shownCatalog.current().catalog, id), link, systems.current(), {
				ask: (name) => askStorybook(vscode.window, name),
				keep: (system, address) => systems.setStorybook(system, address),
				reread: () => catalog.again(),
				open: openExternal,
			}),
		openPrimitives: () => tabs.open({ kind: 'primitives' }),
		openVoiceAndTone,
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
	const pickComponent = async (): Promise<string | undefined> => {
		const shown = shownCatalog.current().catalog;
		if (shown?.state !== 'ready') return void tell('There is no design system shown here: the Design System tab says why.');
		const items = shown.components.map((c) => ({ label: c.name, description: c.group, id: c.id }));
		return (await vscode.window.showQuickPick(items, { placeHolder: 'Open a component', matchOnDescription: true }))?.id;
	};
	return {
		handlers,
		shownComponents: () => tabs.shownComponents(),
		read: () => catalog.start(),
		anotherShown: () => {
			edits.set([]);
			values.set({});
			tabs.closeComponents();
			void catalog.start();
		},
		disposables: [
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
