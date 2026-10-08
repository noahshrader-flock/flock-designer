import './viewer.css';
import { createRoot } from 'react-dom/client';
import { TooltipProvider } from '../renderer/ui/tooltip';
import { Viewer, type ViewerConfig } from './Viewer';

/**
 * Started by a prototype's page on the published site, which says what it is in `#flkd-config` and leaves room for the
 * comments in its bar and beside its frame. A page without those has nothing to comment on, and is left as it is.
 */
const config = document.getElementById('flkd-config');
const bar = document.getElementById('flkd-bar');
const panel = document.getElementById('flkd-panel');
const frame = document.querySelector<HTMLIFrameElement>('iframe#flkd-frame');
if (config && bar && panel && frame) {
	const root = document.createElement('div');
	document.body.append(root);
	createRoot(root).render(
		<TooltipProvider>
			<Viewer config={JSON.parse(config.textContent ?? '{}') as ViewerConfig} slots={{ bar, panel, frame }} />
		</TooltipProvider>,
	);
}
