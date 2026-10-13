import { join } from 'node:path';
import * as vscode from 'vscode';
import { served } from '../../src/main/handle';
import { type Context, findContext } from '../../src/main/services/findContext';
import type { Project } from '../../src/shared/contract';
import { parsePrototypeName } from '../../src/shared/prototypeNames';
import { iterationLabel, workOf } from '../../src/shared/work';
import { Panels } from './bridge';
import { startCore } from './core';
import { PanelProvider } from './panel';
import { Reviews, siteIn } from './review';

/** Kept by the extension: the design system the person located, when nothing open holds one. */
const LOCATED = 'dsnr.located';

/**
 * DSNR, started when its panel is first shown or a command of its is run. The core starts in VS Code's shell, finds what
 * is open (the product, its design system, the design repository), trusts the product folder the person opened, and
 * restores their GitHub session without asking.
 */
export const activate = async (context: vscode.ExtensionContext): Promise<void> => {
	// Run from its source, in Development or under VS Code's test runner; never once installed from a package.
	const development = context.extensionMode !== vscode.ExtensionMode.Production;
	const log = development ? vscode.window.createOutputChannel('DSNR', { log: true }) : undefined;
	if (log) context.subscriptions.push(log);

	const panels = new Panels();
	const { core, github, shell, storage } = startCore(context, panels);
	const folders = () => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
	const located = () => context.globalState.get<string>(LOCATED) ?? null;

	let found: Context = await findContext({ folders: folders(), located: located() });
	/** The product folder the person opened: VS Code trusts it, so DSNR does, as the app trusts a checkout accepted. */
	const trust = async () => {
		if (found.product) await shell.open(found.product).catch((err: unknown) => log?.warn(`The product could not be opened: ${String(err)}`));
	};
	const refresh = async () => {
		found = await findContext({ folders: folders(), located: located() });
		await trust();
		panels.post({ type: 'context', context: found });
	};
	await trust();
	void github.restore();

	const reviews = new Reviews(vscode, core.prototypeServer, siteIn(storage), join(context.extensionUri.fsPath, 'dist', 'viewer'));
	const openReview = async ({ projectId, name, title }: { projectId: string; name: string; title: string }) => {
		if (!found.designRepository)
			throw new Error(found.missing.find((m) => m.startsWith('The design repository')) ?? 'The design repository is not here.');
		await reviews.open({ records: found.designRepository, projectId, name, title });
	};
	const locate = async () => {
		const chosen = await core.ports.chooseFolder({ title: 'Locate design system' });
		if (chosen === null) return;
		await context.globalState.update(LOCATED, chosen);
		await refresh();
		if (found.designSystem?.how !== 'located' && found.designSystem?.root !== chosen)
			void vscode.window.showWarningMessage('That folder holds no design system: no Storybook stories and no tokens were found in it.');
	};

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(
			'dsnr.panel',
			new PanelProvider({
				extensionUri: context.extensionUri,
				panels,
				github,
				context: () => found,
				locate,
				openReview,
				development,
				...(log ? { log } : {}),
			}),
		),
		vscode.commands.registerCommand('dsnr.open', () => vscode.commands.executeCommand('workbench.view.extension.dsnr')),
		vscode.commands.registerCommand('dsnr.openReview', async () => {
			const picked = await pickPrototype();
			if (picked) await openReview(picked).catch((err: unknown) => void vscode.window.showErrorMessage(String(err)));
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(() => void refresh()),
		// Coming back to VS Code is a good moment to publish what was done meanwhile, as coming back to the app's window is.
		vscode.window.onDidChangeWindowState((s) => s.focused && void shell.publish()),
	);
};

/** Each project's prototypes, newest first, to choose one for review: as the panel's rows open them. */
const pickPrototype = async (): Promise<{ projectId: string; name: string; title: string } | undefined> => {
	const listed = (await served().get('listProjects')?.()) as { ok: boolean; value?: Project[]; error?: string } | undefined;
	if (!listed?.ok) {
		void vscode.window.showErrorMessage(listed?.error ?? 'The projects could not be read.');
		return undefined;
	}
	const items = (listed.value ?? []).flatMap((p) =>
		workOf(p.iterations, 'prototype')
			.filter((i) => parsePrototypeName(i.name) !== null)
			.map((i) => ({
				label: p.title,
				description: iterationLabel(i),
				review: { projectId: p.id, name: i.name, title: `${p.title} · ${iterationLabel(i)}` },
			})),
	);
	if (items.length === 0) {
		void vscode.window.showInformationMessage('There is no prototype to review here yet.');
		return undefined;
	}
	return (await vscode.window.showQuickPick(items, { placeHolder: 'Open a prototype for review' }))?.review;
};

export const deactivate = (): void => undefined;
