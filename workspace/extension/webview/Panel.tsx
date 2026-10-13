import { useState } from 'react';
import type { Project } from '../../src/shared/domain/projects';
import { DesignSystem } from './DesignSystem';
import { SAMPLE_DESIGN_SYSTEM, SAMPLE_PROJECTS, type SampleDesignSystem } from './fixtures';
import { Projects } from './Projects';
import { Toggle } from './ui/Toggle';
import { type Tab, vscode } from './vscode';

const TABS = [
	{ value: 'projects', label: 'Projects', icon: 'folder-library' },
	{ value: 'design-system', label: 'Design System', icon: 'symbol-color' },
] as const satisfies { value: Tab; label: string; icon: string }[];

/** What the panel shows: sample data until it is connected (Phase 0); a test gives its own. */
export interface PanelData {
	projects: Project[];
	designSystem: SampleDesignSystem | null;
}

/**
 * DSNR's panel: the Projects and Design System toggle at its very top, and under it the one chosen. The choice is kept in
 * VS Code's state for the panel, so a reload (or the panel being hidden and shown) leaves it where it was.
 */

export const Panel = ({ projects = SAMPLE_PROJECTS, designSystem = SAMPLE_DESIGN_SYSTEM }: Partial<PanelData>) => {
	const [tab, setTab] = useState<Tab>(() => vscode().getState()?.tab ?? 'projects');
	const choose = (next: Tab) => {
		setTab(next);
		vscode().setState({ tab: next });
	};
	return (
		<main className="panel">
			<div className="panel-top">
				<Toggle label="View" options={TABS} value={tab} onChange={choose} />
			</div>
			<section data-tab-body={tab} className="tab-body">
				{tab === 'projects' ? <Projects projects={projects} /> : <DesignSystem system={designSystem} />}
			</section>
		</main>
	);
};
