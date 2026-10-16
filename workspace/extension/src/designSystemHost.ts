import type * as VsCode from 'vscode';
import type { DesignSystemsMemory } from '../../src/main/services/designSystems';
import { tokenEditsOf } from '../../src/main/services/tokenEdits';
import type { WorkspaceApi } from '../../src/shared/contract';
import { valueOf } from '../../src/shared/result';
import type { Tell } from './agentWork';
import type { Panels } from './bridge';
import { TokenTrial, componentLink, componentOf, libraryFileIn } from './designSystem';
import { DesignTabs } from './designTabs';
import { type HostMessage, readComponentArg, readMessage } from './messages';
import { type DesignSystemAsks, answerPage } from './bridge';
import { dsnrPage } from './panel';
import type { LocalAddresses } from './html';

/**
 * The design system in VS Code (6.1, 6.2), wired: the change to its tokens being tried, kept here for every page
 * (`TokenTrial`); its tabs in the editor, each DSNR's own page answered as the panel is (`DesignTabs`); what its pages ask
 * (`DesignSystemAsks`); and its commands, Open a component (given one by code, or chosen in VS Code's quick pick, the
 * natural form for one of many) and Open Primitives. What goes wrong is said (`failed`).
 */
export const designSystemHost = ({
	vscode,
	dist,
	api,
	panels,
	systems,
	local,
	openVoiceAndTone,
	openExternal,
	tell,
	failed,
	failedFor,
	onShown,
}: {
	vscode: typeof VsCode;
	/** The extension's build, which its pages load from. */
	dist: VsCode.Uri;
	api: Pick<WorkspaceApi, 'designSystemCatalog'>;
	panels: Panels;
	/** The design system the core shows, whose clone a token's file is in. */
	systems: Pick<DesignSystemsMemory, 'current'>;
	local: () => Promise<LocalAddresses>;
	openVoiceAndTone: () => Promise<void>;
	openExternal: (url: string) => Promise<void>;
	tell: Tell;
	failed: (err: unknown) => void;
	failedFor: (fromCode: boolean) => (err: unknown) => void;
	/** Told when a component's tab opens, closes, or is brought in front or covered. */
	onShown: () => void;
}) => {
	const trial = new TokenTrial((m) => panels.post(m));
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
		receive: async (webview, raw) => {
			const message = readMessage(raw);
			if (!message) return;
			try {
				if (message.type === 'ready') await webview.postMessage({ type: 'token-edits', edits: trial.current() } satisfies HostMessage);
				else await answerPage(webview as VsCode.Webview, message, asks);
			} catch (err) {
				failed(err);
			}
		},
	});
	const asks: DesignSystemAsks = {
		openComponent: async (id) => {
			const component = await componentOf(api, id);
			await tabs.open({ kind: 'component', id: component.id, name: component.name });
		},
		componentLink: async (id, link) => openExternal(componentLink(await componentOf(api, id), link)),
		openPrimitives: () => tabs.open({ kind: 'primitives' }),
		openVoiceAndTone,
		// A file of the design system, as the person's clone has it, at its line: a token's, or where a value is written.
		openLibrarySource: async (file, line) => {
			const system = systems.current();
			const path = system === null ? null : libraryFileIn(system, file);
			if (path === null) throw new Error(`${file} is not a file of the design system shown.`);
			const at = new vscode.Position(line - 1, 0);
			await vscode.window.showTextDocument(vscode.Uri.file(path), { selection: new vscode.Range(at, at), preview: true });
		},
		edits: () => trial.current(),
		setEdits: (edits) => trial.set(tokenEditsOf(edits)),
	};
	/** A component of the design system shown, chosen from its catalog in VS Code's quick pick, by its story file. */
	const pickComponent = async (): Promise<string | undefined> => {
		const catalog = valueOf(await api.designSystemCatalog(false));
		if (catalog.state !== 'ready') return void tell('There is no design system shown here: the Design System tab says why.');
		const items = catalog.components.map((c) => ({ label: c.name, description: c.group, id: c.id }));
		return (await vscode.window.showQuickPick(items, { placeHolder: 'Open a component', matchOnDescription: true }))?.id;
	};
	return {
		asks,
		/** The components whose tab is in front. */
		shownComponents: () => tabs.shownComponents(),
		/** Another design system is shown: no change is being tried on it, and the last one's components' tabs are closed. */
		anotherShown: () => {
			trial.set([]);
			tabs.closeComponents();
		},
		disposables: [
			// A component in its own tab: given one by its story file, by code, or chosen from the design system shown.
			vscode.commands.registerCommand('dsnr.openComponent', async (raw: unknown) => {
				if (raw !== undefined) {
					const id = readComponentArg(raw);
					if (id === null) throw new Error('DSNR: Open a component was given something that is not a component.');
					return asks.openComponent(id).catch(failedFor(true));
				}
				const picked = await pickComponent().catch(failed);
				if (picked) await asks.openComponent(picked).catch(failed);
			}),
			vscode.commands.registerCommand('dsnr.openPrimitives', () => asks.openPrimitives().catch(failed)),
		],
	};
};
