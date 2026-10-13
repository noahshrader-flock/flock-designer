import './viewer.css';
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '../renderer/ui/tooltip';
import { type Relay, listenForDsnr } from './relay';
import { Viewer, type ViewerConfig, type ViewerSlots } from './Viewer';

/**
 * Started by a prototype's page on the published site, which says what it is in `#dsnr-config` and holds a plain link
 * back to the project in `#dsnr-bar` until this takes the bar over. A page without those has nothing to show, and is
 * left as it is. In DSNR's review tab in VS Code, the tab says hello, and from then on the viewer comments through it.
 */

const InPage = ({ config, slots }: { config: ViewerConfig; slots: ViewerSlots }) => {
	const [relay, setRelay] = useState<Relay | null>(null);
	useEffect(() => listenForDsnr(window, setRelay), []);
	return <Viewer config={config} slots={slots} relay={relay} />;
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
