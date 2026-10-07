import { BrowserWindow, app, safeStorage, screen, shell } from 'electron';
import { join } from 'node:path';
import { CHANNELS } from '../shared/contract';
import { registerIpc } from './ipc';
import { SessionMemory } from './services/handoff';
import { AgentRunner } from './services/agent';
import { DesignRepo } from './services/designRepo';
import { CheckoutMemory } from './services/checkoutMemory';
import { PageView } from './services/pageView';
import { MIN_WINDOW, type WindowState, WindowMemory, restoreState } from './services/windowMemory';
import { QuickServer } from './services/quickServer';
import type { Fetcher } from './services/github';
import { GitHubSession } from './services/githubSession';
import { RuntimeManager } from './services/runtime';
import { ShareRunner } from './services/share';
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

const DEFAULT_SIZE = { width: 1260, height: 780 };

const createWindow = (): BrowserWindow => {
	// A check run for testing must neither read nor change how the person's own window is kept.
	const testing = smokeMode || process.argv.includes('--smoke-page') || process.argv.includes('--smoke-local');
	const memory = new WindowMemory(WindowMemory.defaultPath(app.getPath('userData')));
	const state: WindowState = testing
		? DEFAULT_SIZE
		: restoreState(memory.read(), screen.getAllDisplays().map((d) => d.workArea), DEFAULT_SIZE);
	const window = new BrowserWindow({
		width: state.width,
		height: state.height,
		...(state.x !== undefined && state.y !== undefined ? { x: state.x, y: state.y } : {}),
		minWidth: MIN_WINDOW.width,
		minHeight: MIN_WINDOW.height,
		show: !smokeMode && !process.argv.includes('--smoke-page') && !process.argv.includes('--smoke-local'),
		title: 'Flock Designer',
		// No native title bar: the app's own top bar is the toolbar. On macOS the window
		// buttons stay, inset to sit centred in it; elsewhere the system draws its
		// controls over the bar's right edge.
		titleBarStyle: 'hidden',
		...(process.platform === 'darwin'
			? { trafficLightPosition: { x: 20, y: 20 } }
			: { titleBarOverlay: { color: '#ffffff', symbolColor: '#111111', height: 56 } }),
		backgroundColor: '#ffffff',
		webPreferences: {
			preload: join(__dirname, '../preload/index.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
			webSecurity: true,
		},
	});

	if (!testing) {
		if (state.maximized) window.maximize();
		// The size it has when not maximised or full screen, so un-maximising returns to it. Saved shortly after
		// the last change, not on every pixel of a drag, and once more on the way out.
		let timer: ReturnType<typeof setTimeout> | undefined;
		const save = () => {
			if (window.isDestroyed() || window.isMinimized()) return;
			const { x, y, width, height } = window.getNormalBounds();
			memory.write({ x, y, width, height, maximized: window.isMaximized() });
		};
		const later = () => {
			clearTimeout(timer);
			timer = setTimeout(save, 400);
		};
		window.on('resize', later);
		window.on('move', later);
		window.on('maximize', later);
		window.on('unmaximize', later);
		window.on('close', save);
	}

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
	const share = new ShareRunner((status) => window.webContents.send(CHANNELS.shareStatusChanged, status));

	const github = new GitHubSession(
		GITHUB_CLIENT_ID,
		new TokenStore(TokenStore.defaultPath(app.getPath('userData')), safeStorage),
		// Node ships fetch; the Fetcher type is the narrow slice the session uses, so
		// tests can pass a stub without pulling in all of fetch's surface.
		fetch as unknown as Fetcher,
		(state) => window.webContents.send('workspace:event:signInChanged', state),
	);
	const designRepo = new DesignRepo(github, DESIGN_REPO);

	const page = new PageView(window, (route) => window.webContents.send('workspace:event:pageRoute', route), (e) =>
		window.webContents.send('workspace:event:pinEvent', e),
	);

	const quickServer = new QuickServer();
	const memory = new CheckoutMemory(CheckoutMemory.defaultPath(app.getPath('userData')));

	const publishing = registerIpc({
		window,
		opened,
		runtime,
		agent,
		share,
		github,
		designRepo,
		page,
		memory,
		onPublishStatus: (status) => window.webContents.send(CHANNELS.publishStatusChanged, status),
		quickRoot: join(app.getPath('userData'), 'quick'),
		quickServer,
		sessions: new SessionMemory(SessionMemory.defaultPath(app.getPath('userData'))),
	});
	window.on('closed', () => quickServer.close());
	// Coming back to the window is a good moment to publish whatever was done while it was away.
	window.on('focus', () => void publishing.publish());
	// And now and then regardless, because work done in a terminal while this window sits in front would
	// otherwise wait for the next time the window is focused.
	const backstop = setInterval(() => void publishing.publish(), 5 * 60_000);
	window.on('closed', () => clearInterval(backstop));

	// Restores a previous session from the keychain without blocking the window.
	void github.restore();

	/**
	 * Nothing the app started may outlive the window.
	 *
	 * Wired to the window closing, not only to quitting: on macOS closing the last
	 * window does not quit, so a `before-quit`-only cleanup left a dev server
	 * holding its port and an agent still writing to the repository.
	 */
	const stopEverything = () => {
		runtime.stopAll();
		agent.stop();
		share.stop();
		page.close();
	};
	window.on('closed', stopEverything);

	app.on('before-quit', () => {
		stopEverything();
	});

	if (process.argv.includes('--smoke-local')) {
		void import('./smokeLocal')
			.then(({ runLocalSmoke }) => runLocalSmoke(window, process.env.FD_COKE ?? '', process.env.FD_PROJECT ?? ''))
			.then(() => app.exit(0))
			.catch((err) => {
				console.error(`smoke-local: FAILED -- ${err instanceof Error ? err.message : String(err)}`);
				app.exit(1);
			});
		setTimeout(() => {
			console.error('smoke-local: timed out');
			app.exit(1);
		}, 150_000);
	}

	if (process.argv.includes('--smoke-page')) {
		void import('./smokePage')
			.then(({ runPageSmoke }) => runPageSmoke(window))
			.then(() => app.exit(0))
			.catch((err) => {
				console.error(`smoke-page: FAILED -- ${err instanceof Error ? err.message : String(err)}`);
				app.exit(1);
			});
		setTimeout(() => {
			console.error('smoke-page: timed out');
			app.exit(1);
		}, 90_000);
	}

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
