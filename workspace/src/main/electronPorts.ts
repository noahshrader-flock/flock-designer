import { type BrowserWindow, clipboard, dialog, shell } from 'electron';
import type { Ports } from './ports';
import { checkInWindow } from './services/accessibilityWindow';
import { locateClaude } from './services/agent';
import { coverInWindow } from './services/coverWindow';
import { findEditor, openFolder, openPrompt, openSession } from './services/editor';
import { ghApi } from './services/ghCli';
import { realShareTools } from './services/shareTools';
import { measureInWindows } from './services/storyMeasure';

/** The app's ports (`Ports`): Electron's dialogs, shell and clipboard, the person's own tools, and hidden windows. */
export const electronPorts = (window: BrowserWindow): Ports => {
	// One for both: the person's own command line, which lists their repositories and opens their pull requests.
	const person = ghApi();
	return {
		chooseFolder: async ({ title, defaultPath, canCreate = false }) => {
			const { canceled, filePaths } = await dialog.showOpenDialog(window, {
				title,
				...(defaultPath !== undefined ? { defaultPath } : {}),
				properties: canCreate ? ['openDirectory', 'createDirectory'] : ['openDirectory'],
			});
			return canceled ? null : (filePaths[0] ?? null);
		},
		tell: async ({ message, detail }) => {
			await dialog.showMessageBox({ type: 'info', message, detail });
		},
		openExternal: (url) => shell.openExternal(url),
		openPath: async (path) => {
			await shell.openPath(path);
		},
		copy: (text) => clipboard.writeText(text),
		httpStatus: async (url) => {
			const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(6000) });
			await res.body?.cancel();
			return res.status;
		},
		editor: { find: () => findEditor(), openFolder, openPrompt, openSession },
		claude: () => locateClaude(),
		personGitHub: person,
		shareTools: (root) => realShareTools(root, person),
		headless: { measure: measureInWindows, scan: checkInWindow, draw: coverInWindow },
	};
};
