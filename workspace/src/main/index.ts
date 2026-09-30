import { BrowserWindow, app, shell } from 'electron';
import { join } from 'node:path';
import { registerIpc } from './ipc';
import { AgentRunner } from './services/agent';
import { RuntimeManager } from './services/runtime';
import { OpenedCheckouts } from './services/session';

/**
 * The application shell.
 *
 * The renderer gets no Node, no filesystem, no shell and no raw IPC. It talks to
 * a named set of operations through a preload bridge and nothing else, so a
 * mistake -- or a compromised page -- cannot reach the machine.
 */

const isDev = !app.isPackaged;

/** Set by the smoke check: boot, prove the window exists, exit. */
const smokeMode = process.argv.includes('--smoke');

const createWindow = (): BrowserWindow => {
	const window = new BrowserWindow({
		width: 1280,
		height: 860,
		show: !smokeMode,
		title: 'Flock Designer Workspace',
		backgroundColor: '#ffffff',
		webPreferences: {
			preload: join(__dirname, '../preload/index.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			webSecurity: true,
		},
	});

	// A link to Figma or GitHub opens in the real browser. Nothing navigates the
	// app window itself: a window that can be navigated is a window that can be
	// navigated somewhere else.
	window.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith('https://')) {
			void shell.openExternal(url);
		}
		return { action: 'deny' };
	});
	window.webContents.on('will-navigate', (event) => event.preventDefault());

	const devServer = process.env.ELECTRON_RENDERER_URL;
	if (isDev && devServer) {
		void window.loadURL(devServer);
	} else {
		void window.loadFile(join(__dirname, '../renderer/index.html'));
	}

	return window;
};

void app.whenReady().then(() => {
	const window = createWindow();
	const opened = new OpenedCheckouts();

	const runtime = new RuntimeManager({
		onLog: (line) => window.webContents.send('workspace:event:runLog', line),
		onStatus: (status) => window.webContents.send('workspace:event:previewStatus', status),
	});
	const agent = new AgentRunner((line) => window.webContents.send('workspace:event:agentLog', line));

	registerIpc({ window, opened, runtime, agent });

	// A dev server started from the app must not outlive it.
	app.on('before-quit', () => {
		runtime.stopAll();
		agent.stop();
	});

	if (smokeMode) {
		// Prove the whole boot path ran -- ready fired, the window exists, the
		// renderer loaded -- then leave. This is what `npm run smoke` asserts on.
		window.webContents.once('did-finish-load', () => {
			console.log(`smoke: window created and renderer loaded (${window.getTitle()})`);
			app.exit(0);
		});
		setTimeout(() => {
			console.error('smoke: renderer did not finish loading');
			app.exit(1);
		}, 30_000);
	}

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit();
	}
});
