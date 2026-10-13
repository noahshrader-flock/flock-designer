import { join } from 'node:path';
import * as vscode from 'vscode';
import { served } from '../../src/main/handle';
import { type Context, findContext } from '../../src/main/services/findContext';
import type { Project, SignInState } from '../../src/shared/contract';
import { Panels } from './bridge';
import { type Review, reviewsOf } from './messages';
import { startCore } from './core';
import { PanelProvider, failed } from './panel';
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
	const provider = new PanelProvider({
		extensionUri: context.extensionUri,
		panels,
		context: () => found,
		locate: () => locate(),
		openReview: (review) => openReview(review),
		development,
		...(log ? { log } : {}),
	});
	/** Who is signed in, in VS Code's own title bar: the username beside the DSNR mark, and Sign in or the account at its far right. */
	const showAccount = (state: SignInState) => {
		void vscode.commands.executeCommand('setContext', 'dsnr.signedIn', state.state === 'signedIn');
		provider.showAccount(state.state === 'signedIn' ? state.user.login : undefined);
	};
	const { core, github, shell, storage } = startCore(context, panels, showAccount);
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
	const openReview = async ({ projectId, name, title }: Review) => {
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
		vscode.window.registerWebviewViewProvider('dsnr.panel', provider),
		vscode.commands.registerCommand('dsnr.open', () => vscode.commands.executeCommand('workbench.view.extension.dsnr')),
		vscode.commands.registerCommand('dsnr.openReview', async () => {
			const picked = await pickPrototype();
			if (picked) await openReview(picked).catch(failed);
		}),
		vscode.commands.registerCommand('dsnr.signIn', () => github.signIn().catch(failed)),
		vscode.commands.registerCommand('dsnr.account', async () => {
			const state = github.state();
			if (state.state !== 'signedIn') return;
			const signOut = { label: '$(sign-out) Sign out of DSNR', description: 'VS Code keeps your GitHub account in its Accounts menu' };
			const picked = await vscode.window.showQuickPick([signOut], { placeHolder: `Signed in to GitHub as ${state.user.login}` });
			if (picked === signOut) github.signOut();
		}),
		vscode.workspace.onDidChangeWorkspaceFolders(() => void refresh()),
		// Coming back to VS Code is a good moment to publish what was done meanwhile, as coming back to the app's window is.
		vscode.window.onDidChangeWindowState((s) => s.focused && void shell.publish()),
	);
};

/** Each project's prototypes, newest first (`reviewsOf`), to choose one for review: as the panel's rows open them. */
const pickPrototype = async (): Promise<Review | undefined> => {
	const listed = (await served().get('listProjects')?.()) as { ok: boolean; value?: Project[]; error?: string } | undefined;
	if (!listed?.ok) {
		void vscode.window.showErrorMessage(listed?.error ?? 'The projects could not be read.');
		return undefined;
	}
	const items = (listed.value ?? []).flatMap(reviewsOf).map((review) => ({ label: review.title, review }));
	if (items.length === 0) {
		void vscode.window.showInformationMessage('There is no prototype to review here yet.');
		return undefined;
	}
	return (await vscode.window.showQuickPick(items, { placeHolder: 'Open a prototype for review' }))?.review;
};
