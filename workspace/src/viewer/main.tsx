import './viewer.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from './ui/tooltip';
import { type Relay, isServedHere, versionAddress, keyFromAddress, listenForDsnr, serverRelay } from './relay';
import { applyEditorTheme, applyScheme, systemIsDark, watchSystemScheme } from './scheme';
import { type EditorTheme, isDarkTheme } from '../shared/reviewRelay';
import { Viewer, type ViewerConfig, type ViewerSlots } from './Viewer';
import { saveToken } from './browserAdapter';
import { type SignInConfig, finishSignIn, takeNote } from './signIn';

/**
 * Started by a prototype's page on the published site, which says what it is in `#dsnr-config` and holds a plain link
 * back to the project in `#dsnr-bar` until this takes the bar over. A page without those has nothing to show, and is
 * left as it is. In DSNR's review tab in VS Code, the tab says hello, and from then on the viewer comments through it. Opened
 * in the browser from DSNR, the page has a key, and comments through this machine's server with it (BROWSER_COMMENTS_PLAN).
 */

/**
 * Signing in, when the site offers it (`#dsnr-sign-in`): on the site's front page, where GitHub sends a person back, the
 * sign-in is finished, and they go back to the page they started on; that page then says how it went, if it did not go.
 */
const signInAt = document.getElementById('dsnr-sign-in');
const signIn = signInAt ? (JSON.parse(signInAt.textContent ?? 'null') as SignInConfig | null) : null;
if (signIn) void finishSignIn(signIn, window, saveToken);
const note = signIn ? takeNote(window) : null;

/** The key, if this page was opened from DSNR: read once, as the page starts, so it is out of the address at once. */
const key = keyFromAddress(window);
const framed = window.parent !== window;

const InPage = ({ config, slots }: { config: ViewerConfig; slots: ViewerSlots }) => {
	const [relay, setRelay] = useState<Relay | null>(() => (key === null ? null : serverRelay(key)));
	// VS Code's theme when its review tab frames this page and says; else light or dark as the computer is, as it changes.
	const [system, setSystem] = useState(() => systemIsDark(window));
	const [editor, setEditor] = useState<EditorTheme | null>(null);
	useEffect(() => (key === null ? listenForDsnr(window, setRelay, setEditor) : undefined), []);
	useEffect(() => watchSystemScheme(window, setSystem), []);
	useEffect(() => {
		applyScheme(document, editor ? isDarkTheme(editor.kind) : system, editor !== null);
		applyEditorTheme(document, editor);
	}, [editor, system]);
	// Opened from DSNR in the browser: after Address, to the version it showed its change in (the tab shows it in VS Code).
	const onAddressed = (name: string) => {
		const to = versionAddress(config.projectHref, name, location.href.split('#')[0] as string);
		if (to === location.href.split('#')[0]) location.reload();
		else if (to !== null) location.assign(to);
	};
	// From this machine, not in DSNR's tab, and with no key: opened some other way than Open in browser.
	return (
		<Viewer
			config={config}
			slots={slots}
			relay={relay}
			openedHere={key === null && !framed && isServedHere(location)}
			signIn={signIn}
			note={note}
			{...(key === null ? {} : { onAddressed })}
		/>
	);
};

const config = document.getElementById('dsnr-config');
const bar = document.getElementById('dsnr-bar');
const panel = document.getElementById('dsnr-panel');
const frame = document.querySelector<HTMLIFrameElement>('iframe#dsnr-frame');
if (config && bar && panel && frame) {
	// The plain link is only for a page this never reaches: the app's bar replaces it.
	bar.replaceChildren();
	const root = document.createElement('div');
	document.body.append(root);
	createRoot(root).render(
		<TooltipProvider>
			<InPage config={JSON.parse(config.textContent ?? '{}') as ViewerConfig} slots={{ bar, panel, frame }} />
		</TooltipProvider>,
	);
}
