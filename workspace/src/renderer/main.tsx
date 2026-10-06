import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { TooltipProvider } from './ui/tooltip';

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
