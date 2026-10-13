import { useEffect, useState } from 'react';
import type { Context } from '../../src/main/services/findContext';
import { useWorkspace } from '../../src/renderer/useWorkspace';
import type { SignInState } from '../../src/shared/contract';
import { type Catalog, DesignSystem } from './DesignSystem';
import { onHost, workspace } from './host';
import { Projects, type ProjectsRead } from './Projects';
import type { Review } from '../src/messages';
import { Toggle } from './ui/Toggle';
import { type Tab, vscode } from './vscode';

const TABS = [
	{ value: 'projects', label: 'Projects', icon: 'folder-library' },
	{ value: 'design-system', label: 'Design System', icon: 'symbol-color' },
] as const satisfies { value: Tab; label: string; icon: string }[];

/** What the panel draws, and what it does when pressed: the container (`Panel`) gives it, and a test gives its own. */
export interface PanelViewProps {
	tab: Tab;
	onTab: (tab: Tab) => void;
	account: SignInState;
	/** What is open, once the extension has said; null until then. */
	context: Context | null;
	projects: ProjectsRead;
	onOpen: (review: Review) => void;
	onNew: () => void;
	onLocate: () => void;
	catalog?: Catalog;
}

/**
 * DSNR's panel: the toggle at its very top, and under it the view chosen. Who is signed in is VS Code's to show, in its
 * own title bar beside the DSNR mark; the page reads it only to say whose projects these are.
 */
export const PanelView = ({ tab, onTab, account, context, projects, onOpen, onNew, onLocate, catalog }: PanelViewProps) => (
	<main className="panel">
		<div className="panel-top">
			<Toggle label="View" options={TABS} value={tab} onChange={onTab} />
		</div>
		<section data-tab-body={tab} className="tab-body">
			{context === null ? (
				<p className="note">Looking at what is open…</p>
			) : tab === 'projects' ? (
				<Projects
					read={projects}
					product={context.product !== null ? { open: true } : { open: false, why: context.missing[0] ?? 'No product is open.' }}
					signedIn={account.state === 'signedIn'}
					onOpen={onOpen}
					onNew={onNew}
				/>
			) : (
				<DesignSystem found={context.designSystem} onLocate={onLocate} {...(catalog ? { catalog } : {})} />
			)}
		</section>
	</main>
);

/**
 * The panel, connected: what is open from the extension (`context`), the account and the projects from the core over
 * the bridge, read again when either changes, and what the person presses sent back. The tab chosen is kept in VS Code's
 * state for the panel, so a reload leaves it where it was.
 */
export const Panel = () => {
	const [tab, setTab] = useState<Tab>(() => vscode().getState()?.tab ?? 'projects');
	const [context, setContext] = useState<Context | null>(null);
	const [account, setAccount] = useState<SignInState>({ state: 'signedOut' });
	useEffect(() => {
		const stop = onHost((m) => {
			if (m.type === 'context') setContext(m.context);
		});
		// Said once the page listens, so what is open is never sent before it can be heard.
		vscode().postMessage({ type: 'ready' });
		return stop;
	}, []);
	useEffect(() => {
		void workspace()
			.signInState()
			.then((r) => r.ok && setAccount(r.value));
		return workspace().onSignInChanged(setAccount);
	}, []);
	const login = account.state === 'signedIn' ? account.user.login : null;
	const read = useWorkspace(() => workspace().listProjects(), [context?.product ?? null, login], { enabled: context?.product != null });
	return (
		<PanelView
			tab={tab}
			onTab={(next) => {
				setTab(next);
				vscode().setState({ tab: next });
			}}
			account={account}
			context={context}
			projects={{ value: read.value, error: read.error }}
			onOpen={(review) => vscode().postMessage({ type: 'open-review', ...review })}
			onNew={() => vscode().postMessage({ type: 'new-prototype' })}
			onLocate={() => vscode().postMessage({ type: 'locate-design-system' })}
		/>
	);
};
