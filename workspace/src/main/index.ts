import { BrowserWindow, app, safeStorage, shell } from 'electron';
import { join } from 'node:path';
import { registerIpc } from './ipc';
import { AgentRunner } from './services/agent';
import { DesignRepo } from './services/designRepo';
import type { Fetcher } from './services/github';
import { GitHubSession } from './services/githubSession';
import { RuntimeManager } from './services/runtime';
import { OpenedCheckouts } from './services/session';
import { TokenStore } from './services/tokenStore';

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

/**
 * The GitHub App this signs in through.
 *
 * A client ID is not a secret -- the device flow exists precisely so a desktop
 * app needs no client secret -- so it is committed rather than configured. The
 * environment variable is for pointing a development build at another app.
 *
 * The matching app must have device flow enabled and Issues write permission,
 * and must be installed on the design repository. A token it issues cannot see
 * a repository the app is not installed on; verified 2026-10-05.
 */
const GITHUB_CLIENT_ID = process.env.FLOCK_DESIGNER_CLIENT_ID ?? 'Iv23li2z9ayhXhGdFXCm';

/** Where projects and review threads live. */
const DESIGN_REPO = {
	owner: process.env.FLOCK_DESIGNER_REPO_OWNER ?? 'noahshrader-flock',
	repo: process.env.FLOCK_DESIGNER_REPO_NAME ?? 'flock-designer',
};

const createWindow = (): BrowserWindow => {
	const window = new BrowserWindow({
		width: 1280,
		height: 860,
		show: !smokeMode,
		title: 'Flock Designer',
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

	const github = new GitHubSession(
		GITHUB_CLIENT_ID,
		new TokenStore(TokenStore.defaultPath(app.getPath('userData')), safeStorage),
		// Node ships fetch; the Fetcher type is the narrow slice the session uses, so
		// tests can pass a stub without pulling in all of fetch's surface.
		fetch as unknown as Fetcher,
		(state) => window.webContents.send('workspace:event:signInChanged', state),
	);
	const designRepo = new DesignRepo(github, DESIGN_REPO);

	registerIpc({ window, opened, runtime, agent, github, designRepo });

	// Restores a previous session from the keychain without blocking the window.
	void github.restore();

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
