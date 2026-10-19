import './viewer.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipHost } from '../ui/Tooltip';
import { type Relay, isServedHere, versionAddress, keyFromAddress, listenForDsnr, serverRelay } from './relay';
import { applyEditorTheme, applyScheme, systemIsDark, watchSystemScheme } from './scheme';
import { type EditorTheme, isDarkTheme } from '../shared/reviewRelay';
import { Viewer, type ViewerConfig, type ViewerSlots } from './Viewer';
import { saveToken } from './browserAdapter';
import { type SignInConfig, finishSignIn, takeNote } from './signIn';
import { applyTokens } from '../ui/applyTokens';

const signInAt = document.getElementById('dsnr-sign-in');
const signIn = signInAt ? (JSON.parse(signInAt.textContent ?? 'null') as SignInConfig | null) : null;
if (signIn) void finishSignIn(signIn, window, saveToken);
const note = signIn ? takeNote(window) : null;

// Read once, as the page starts, so the key is out of the address at once.
const key = keyFromAddress(window);
const framed = window.parent !== window;

const InPage = ({ config, slots }: { config: ViewerConfig; slots: ViewerSlots }) => {
	const [relay, setRelay] = useState<Relay | null>(() => (key === null ? null : serverRelay(key)));
	const [system, setSystem] = useState(() => systemIsDark(window));
	const [editor, setEditor] = useState<EditorTheme | null>(null);
	useEffect(() => (key === null ? listenForDsnr(window, setRelay, setEditor) : undefined), []);
	useEffect(() => watchSystemScheme(window, setSystem), []);
	useEffect(() => {
		applyScheme(document, editor ? isDarkTheme(editor.kind) : system, editor !== null);
		applyEditorTheme(document, editor);
	}, [editor, system]);
	// Only with a key: in VS Code the tab shows the addressed version itself.
	const onAddressed = (name: string) => {
		const to = versionAddress(config.projectHref, name, location.href.split('#')[0] as string);
		if (to === location.href.split('#')[0]) location.reload();
		else if (to !== null) location.assign(to);
	};
	// `openedHere`: from this machine, not in DSNR's tab, and with no key: opened some other way than Open in browser.
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
	// The plain link is only for a page this never reaches: the review bar replaces it.
	bar.replaceChildren();
	const root = document.createElement('div');
	document.body.append(root);
	applyTokens(document);
	createRoot(root).render(
		<>
			<InPage config={JSON.parse(config.textContent ?? '{}') as ViewerConfig} slots={{ bar, panel, frame }} />
			<TooltipHost />
		</>,
	);
}
