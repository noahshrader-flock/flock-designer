import { useState } from 'react';
import { Toggle } from './ui/Toggle';
import { type Tab, vscode } from './vscode';

const TABS = [
	{ value: 'projects', label: 'Projects', icon: 'folder-library' },
	{ value: 'design-system', label: 'Design System', icon: 'symbol-color' },
] as const satisfies { value: Tab; label: string; icon: string }[];

/**
 * DSGN's panel: the Projects and Design System toggle at its very top, and under it the one chosen. The choice is kept in
 * VS Code's state for the panel, so a reload (or the panel being hidden and shown) leaves it where it was.
 */
export const Panel = () => {
	const [tab, setTab] = useState<Tab>(() => vscode().getState()?.tab ?? 'projects');
	const choose = (next: Tab) => {
		setTab(next);
		vscode().setState({ tab: next });
	};
	return (
		<main className="panel">
			<Toggle label="View" options={[...TABS]} value={tab} onChange={choose} />
			<section data-tab-body={tab} className="tab-body">
				{tab === 'projects' ? 'Projects' : 'Design System'}
			</section>
		</main>
	);
};
