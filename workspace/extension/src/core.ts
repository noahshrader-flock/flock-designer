import { mkdirSync } from 'node:fs';
import * as vscode from 'vscode';
import { networkFetch } from '../../src/host/github';
import { appPaths } from '../../src/main/appPaths';
import { createCore } from '../../src/main/core';
import { chromeHeadless } from '../../src/main/services/chromeHeadless';
import { registerIpc } from '../../src/main/ipc';
import type { SignInState } from '../../src/shared/contract';
import type { Panels } from './bridge';
import { VsCodeGitHub } from './github';
import { noPreview } from './preview';
import { vscodePorts } from './vscodePorts';

/**
 * The core, in VS Code: the same services the app makes (`createCore`), given VS Code's shell. Its files go in the
 * extension's own storage, never the app's settings folder; events go to DSNR's panels; the person signs in through VS
 * Code, and who is signed in is told to the panels and to `onSignInChanged`; there is no native preview; VS Code owns the
 * theme; and prototypes' pictures and accessibility checks are drawn by the browser on this machine, headless.
 */
export const startCore = (context: vscode.ExtensionContext, panels: Panels, onSignInChanged: (state: SignInState) => void) => {
	const storage = context.globalStorageUri.fsPath;
	mkdirSync(storage, { recursive: true });
	// The browser on this machine, headless: for prototypes' pictures and their accessibility checks. Closed with DSNR.
	const headless = chromeHeadless();
	const github = new VsCodeGitHub(vscode.authentication, networkFetch, context.globalState, (state) => {
		panels.sink('onSignInChanged', state);
		onSignInChanged(state);
	});
	const core = createCore({
		paths: appPaths(storage),
		emit: panels.sink,
		ports: vscodePorts(vscode, headless),
		github,
		page: noPreview,
		applyAppearance: () => undefined,
		// Stories are not drawn here yet (Phase 6), so no picture of a component is made this way.
		pictureRecipe: 'vscode, no story pictures yet',
	});
	const shell = registerIpc(core);
	context.subscriptions.push(github.watch(), { dispose: () => core.prototypeServer.close() }, { dispose: () => void headless.close() });
	return { core, github, shell, storage };
};
