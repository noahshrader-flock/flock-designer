import './viewer.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '../renderer/ui/tooltip';
import { type Relay, isServedHere, keyFromAddress, listenForDsnr, serverRelay } from './relay';
import { Viewer, type ViewerConfig, type ViewerSlots } from './Viewer';

/**
 * Started by a prototype's page on the published site, which says what it is in `#dsnr-config` and holds a plain link
 * back to the project in `#dsnr-bar` until this takes the bar over. A page without those has nothing to show, and is
 * left as it is. In DSNR's review tab in VS Code, the tab says hello, and from then on the viewer comments through it. Opened
 * in the browser from DSNR, the page has a key, and comments through this machine's server with it (BROWSER_COMMENTS_PLAN).
 */

/** The key, if this page was opened from DSNR: read once, as the page starts, so it is out of the address at once. */
const key = keyFromAddress(window);
const framed = window.parent !== window;

const InPage = ({ config, slots }: { config: ViewerConfig; slots: ViewerSlots }) => {
	const [relay, setRelay] = useState<Relay | null>(() => (key === null ? null : serverRelay(key)));
	useEffect(() => (key === null ? listenForDsnr(window, setRelay) : undefined), []);
	// From this machine, not in DSNR's tab, and with no key: opened some other way than Open in browser.
	return <Viewer config={config} slots={slots} relay={relay} openedHere={key === null && !framed && isServedHere(location)} />;
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
