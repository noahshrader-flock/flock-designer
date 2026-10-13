import { type BrowserWindow, clipboard, dialog, shell } from 'electron';
import type { Ports } from './ports';
import { checkInWindow } from './services/accessibilityWindow';
import { coverInWindow } from './services/coverWindow';
import { measureInWindows } from './services/storyMeasure';
import { toolPorts } from './toolPorts';

/** The app's ports (`Ports`): Electron's dialogs, shell and clipboard, and hidden windows, with the tools every shell shares. */
export const electronPorts = (window: BrowserWindow): Ports => ({
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
	...toolPorts(),
	headless: { measure: measureInWindows, scan: checkInWindow, draw: coverInWindow },
});
