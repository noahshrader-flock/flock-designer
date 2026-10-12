import { BrowserWindow, app, nativeTheme, safeStorage, screen, shell } from 'electron';
import { join } from 'node:path';
import pkg from '../../package.json';
import { appPaths } from './appPaths';
import { emit } from './handle';
import { registerIpc } from './ipc';
import { quitWithTheWindow } from './lifecycle';
import { SessionMemory } from './services/editor';
import { AgentRunner } from './services/agent';
import { DESIGN_REPO, DesignRepo } from './services/designRepo';
import { CheckoutMemory } from './services/checkoutMemory';
import { CloneFolderMemory } from './services/cloneFolder';
import { DesignSystemsMemory } from './services/designSystems';
import { PICTURE_RECIPE, measureInWindows } from './services/storyMeasure';
import { checkInWindow } from './services/accessibilityCheck';
import { coverInWindow } from './services/coverWindow';
import { PageView } from './services/pageView';
import { AppearanceMemory } from './services/appearance';
import { MIN_WINDOW, type WindowState, WindowMemory, restoreState } from './services/windowMemory';
import { PrototypeServer } from './services/prototypeServer';
import { networkFetch } from './services/github';
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

// The app's saved data (settings, sign-in, working copies) stays in the folder it has always had, whatever the app is
// called: the name of the package would otherwise choose it, and renaming the app would start everyone from nothing.
app.setPath('userData', join(app.getPath('appData'), pkg.settingsFolder));

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
const GITHUB_CLIENT_ID = process.env.DSNR_CLIENT_ID ?? 'Iv23li2z9ayhXhGdFXCm';

const DEFAULT_SIZE = { width: 1160, height: 700 };
/** The window's color until the page is drawn, as the page's own dark background (`--background` in `index.css`). */
const DARK_BACKGROUND = '#0a0a0a';
/** The appearance chosen in Settings, kept in the app's settings: read when the window is made, and kept when it is chosen. */
/** The app's own folder, read when asked: Electron settles where it is before the app is ready. */
const paths = () => appPaths(app.getPath('userData'));
const appearanceMemory = (): AppearanceMemory => new AppearanceMemory(paths().appearance);

const createWindow = (): BrowserWindow => {
	// A check run for testing must neither read nor change how the person's own window is kept.
	const testing = smokeMode || process.argv.includes('--smoke-page') || process.argv.includes('--smoke-local');
	const memory = new WindowMemory(paths().window);
	// The appearance chosen in Settings, set before the window exists so it never shows the wrong one for a moment. It is the
	// system's theme setting for the whole app: the pages and the previews follow it as they followed the computer's.
	if (!testing) nativeTheme.themeSource = appearanceMemory().read();
	const state: WindowState = testing
		? DEFAULT_SIZE
		: restoreState(
				memory.read(),
				screen.getAllDisplays().map((d) => d.workArea),
				DEFAULT_SIZE,
			);
	const window = new BrowserWindow({
		width: state.width,
		height: state.height,
		...(state.x !== undefined && state.y !== undefined ? { x: state.x, y: state.y } : {}),
		minWidth: MIN_WINDOW.width,
		minHeight: MIN_WINDOW.height,
		show: !smokeMode && !process.argv.includes('--smoke-page') && !process.argv.includes('--smoke-local'),
		title: 'DSNR',
		// No native title bar: the app's own top bar is the toolbar. On macOS the window
		// buttons stay, inset to sit centered in it; elsewhere the system draws its
		// controls over the bar's right edge.
		titleBarStyle: 'hidden',
		...(process.platform === 'darwin'
			? { trafficLightPosition: { x: 20, y: 20 } }
			: { titleBarOverlay: { color: '#ffffff', symbolColor: '#111111', height: 56 } }),
		backgroundColor: nativeTheme.shouldUseDarkColors ? DARK_BACKGROUND : '#ffffff',
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
		// The size it has when not maximized or full screen, so un-maximizing returns to it. Saved shortly after
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
		onLog: (line) => emit(window, 'onRunLog', line),
		onStatus: (status) => emit(window, 'onPreviewStatus', status),
	});
	const agent = new AgentRunner((line) => emit(window, 'onAgentLog', line));
	const share = new ShareRunner((status) => emit(window, 'onShareStatus', status));

	const github = new GitHubSession(GITHUB_CLIENT_ID, new TokenStore(paths().githubToken, safeStorage), networkFetch, (state) =>
		emit(window, 'onSignInChanged', state),
	);
	const designRepo = new DesignRepo(github, DESIGN_REPO);

	const page = new PageView(
		window,
		(route) => emit(window, 'onPageRoute', route),
		(e) => emit(window, 'onPinEvent', e),
	);

	const prototypeServer = new PrototypeServer();
	const memory = new CheckoutMemory(paths().checkout);

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
		onPublishStatus: (status) => emit(window, 'onPublishStatus', status),
		prototypesRoot: paths().prototypes,
		prototypeServer,
		sessions: new SessionMemory(paths().agentSessions),
		cloneFolders: new CloneFolderMemory(paths().cloneFolder),
		designSystems: new DesignSystemsMemory(paths().designSystems),
		storyPreviewsRoot: paths().storyPreviews,
		tokenBranchesFile: paths().tokenBranches,
		voiceBranchFile: paths().voiceBranch,
		componentPicturesRoot: paths().componentPictures,
		componentPictureRecipe: PICTURE_RECIPE,
		measureStories: measureInWindows,
		checkPage: checkInWindow,
		drawCover: coverInWindow,
		appearanceMemory: appearanceMemory(),
		applyAppearance: (appearance) => void (nativeTheme.themeSource = appearance),
		// A little after the window is up, so opening the app is not slowed by getting the design system ready.
		warmAfterMs: 3000,
	});
	window.on('closed', () => prototypeServer.close());
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
});

quitWithTheWindow(app);
