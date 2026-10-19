import { mkdirSync } from 'node:fs';
import * as vscode from 'vscode';
import { networkFetch } from '../../src/codeHost/github';
import { appPaths } from '../../src/core/appPaths';
import { cliDataFolder, tellCommandLine } from '../../src/core/services/platform/cliFolder';
import { settingsFolder } from '../../package.json';
import { createCore } from '../../src/core/core';
import { HEADLESS_PICTURE_RECIPE, chromeHeadless } from '../../src/core/services/browser/chromeHeadless';
import { registerCalls } from '../../src/core/calls';
import type { SignInState } from '../../src/shared/contract';
import type { Panels } from './bridge';
import { VsCodeGitHub } from './github';
import { vscodePorts } from './vscodePorts';

/**
 * The core in VS Code (`createCore`), given VS Code's shell: its files in the extension's own storage, events to DSNR's
 * panels, sign-in through VS Code (told to the panels and `onSignInChanged`), and pictures, the stories' tokens and
 * accessibility checks drawn by the browser on this machine, headless.
 */
export const startCore = (context: vscode.ExtensionContext, panels: Panels, onSignInChanged: (state: SignInState) => void) => {
	const storage = context.globalStorageUri.fsPath;
	mkdirSync(storage, { recursive: true });
	const paths = appPaths(storage);
	// The `dsnr` command builds its prototypes here too, so a page made from Claude Code is one the panel has.
	try {
		tellCommandLine(cliDataFolder(settingsFolder), paths.prototypes);
	} catch {
		// A folder that cannot be written leaves the command its own: nothing in the panel depends on it.
	}
	// The browser on this machine, headless: for pictures, stories and accessibility checks. Closed, and waited for, when
	// DSNR stops (`deactivate`), so none is left running after VS Code quits.
	const headless = chromeHeadless();
	const github = new VsCodeGitHub(vscode.authentication, networkFetch, context.globalState, (state) => {
		panels.sink('onSignInChanged', state);
		onSignInChanged(state);
	});
	const core = createCore({
		paths,
		emit: panels.sink,
		ports: vscodePorts(vscode, headless),
		github,
		// Components' pictures are drawn by the browser here, and fingerprinted as drawn that way.
		pictureRecipe: HEADLESS_PICTURE_RECIPE,
	});
	const shell = registerCalls(core);
	context.subscriptions.push(github.watch(), { dispose: () => core.prototypeServer.close() });
	return { core, github, shell, storage, headless };
};
