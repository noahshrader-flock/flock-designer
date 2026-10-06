import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { TooltipProvider } from './ui/tooltip';

/**
 * Follow the system's light or dark setting, as the component library used to.
 *
 * Set before React renders, so the window never shows a light frame for a moment on a dark desktop,
 * and kept in step while the app is open: macOS can switch at sunset under a running app.
 */
const theme = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = () => document.documentElement.classList.toggle('dark', theme.matches);
applyTheme();
theme.addEventListener('change', applyTheme);

const container = document.getElementById('root');
if (!container) {
	throw new Error('index.html is missing #root');
}

createRoot(container).render(
	<StrictMode>
		<TooltipProvider>
			<App />
		</TooltipProvider>
	</StrictMode>,
);
