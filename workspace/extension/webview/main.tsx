import { createRoot } from 'react-dom/client';
import { ComponentTab } from './ComponentTab';
import { Panel } from './Panel';
import { PrimitivesTab } from './PrimitivesTab';
import { readTab } from './tab';
import { TooltipHost } from './ui/Tooltip';
import './styles.css';

// The same page is the panel or one of the design system's tabs, as its body says (`panelHtml`).
const tab = readTab(document.body.dataset.tab);
createRoot(document.getElementById('root') as HTMLElement).render(
	<>
		{/* Every tooltip of the page, told here: the browser's own wait is seconds, and not ours to set. */}
		<TooltipHost />
		{tab === null ? <Panel /> : tab.kind === 'component' ? <ComponentTab id={tab.id} /> : <PrimitivesTab />}
	</>,
);
