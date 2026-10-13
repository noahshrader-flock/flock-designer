import { mkdirSync } from 'node:fs';
import * as vscode from 'vscode';
import { networkFetch } from '../../src/host/github';
import { appPaths } from '../../src/main/appPaths';
import { createCore } from '../../src/main/core';
import { registerIpc } from '../../src/main/ipc';
import type { Panels } from './bridge';
import { VsCodeGitHub } from './github';
import { noPreview } from './preview';
import { vscodePorts } from './vscodePorts';

/**
 * The core, in VS Code: the same services the app makes (`createCore`), given VS Code's shell. Its files go in the
 * extension's own storage, never the app's settings folder; events go to DSNR's panels; the person signs in through VS
 * Code; there is no native preview; VS Code owns the theme; and no pictures are drawn yet.
 */
export const startCore = (context: vscode.ExtensionContext, panels: Panels) => {
	const storage = context.globalStorageUri.fsPath;
	mkdirSync(storage, { recursive: true });
	const github = new VsCodeGitHub(vscode.authentication, networkFetch, context.globalState, (state) => panels.sink('onSignInChanged', state));
	const core = createCore({
		paths: appPaths(storage),
		emit: panels.sink,
		ports: vscodePorts(vscode),
		github,
		page: noPreview,
		applyAppearance: () => undefined,
		pictureRecipe: 'vscode, no pictures yet',
	});
	const shell = registerIpc(core);
	context.subscriptions.push(github.watch(), { dispose: () => core.prototypeServer.close() });
	return { core, github, shell, storage };
};
