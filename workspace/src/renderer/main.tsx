import { FSApp } from '@flocksafety/flock-react-component-lib';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const container = document.getElementById('root');
if (!container) {
	throw new Error('index.html is missing #root');
}

createRoot(container).render(
	<StrictMode>
		<FSApp>
			<App />
		</FSApp>
	</StrictMode>,
);
