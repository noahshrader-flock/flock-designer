import './viewer.css';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '../renderer/ui/tooltip';
import { Viewer, type ViewerConfig } from './Viewer';

/**
 * Started by a prototype's page on the published site, which says what it is in `#dsnr-config` and holds a plain link
 * back to the project in `#dsnr-bar` until this takes the bar over. A page without those has nothing to show, and is
 * left as it is.
 */
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
			<Viewer config={JSON.parse(config.textContent ?? '{}') as ViewerConfig} slots={{ bar, panel, frame }} />
		</TooltipProvider>,
	);
}
