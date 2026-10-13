import { useEffect, useState } from 'react';
import type { Context } from '../../src/main/services/findContext';
import { useWorkspace } from '../../src/renderer/useWorkspace';
import type { MadeCover, SignInState } from '../../src/shared/contract';
import { withCovers } from '../../src/shared/projectList';
import { type Catalog, DesignSystem } from './DesignSystem';
import { onHost, workspace } from './host';
import { Projects, type ProjectsRead } from './Projects';
import type { Review } from '../src/messages';
import { Toggle } from './ui/Toggle';
import { type Tab, type View, vscode } from './vscode';

const TABS = [
	{ value: 'projects', label: 'Projects', icon: 'folder-library' },
	{ value: 'design-system', label: 'Design System', icon: 'symbol-color' },
] as const satisfies { value: Tab; label: string; icon: string }[];

/** What the panel draws, and what it does when pressed: the container (`Panel`) gives it, and a test gives its own. */
export interface PanelViewProps {
	tab: Tab;
	onTab: (tab: Tab) => void;
	view: View;
	onView: (view: View) => void;
	account: SignInState;
	/** What is open, once the extension has said; null until then. */
	context: Context | null;
	projects: ProjectsRead;
	onOpen: (review: Review) => void;
	onNew: () => void;
	onGetStarted: () => void;
	onLocate: () => void;
	catalog?: Catalog;
}

/**
 * DSNR's panel: the toggle at its very top, and under it the view chosen. Who is signed in is VS Code's to show, in its
 * own title bar beside the DSNR mark; the page reads it only to say whose projects these are.
 */
export const PanelView = ({
	tab,
	onTab,
	view,
	onView,
	account,
	context,
	projects,
	onOpen,
	onNew,
	onGetStarted,
	onLocate,
	catalog,
}: PanelViewProps) => (
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
					onGetStarted={onGetStarted}
					view={view}
					onView={onView}
				/>
			) : (
				<DesignSystem found={context.designSystem} onLocate={onLocate} {...(catalog ? { catalog } : {})} />
			)}
		</section>
	</main>
);

/**
 * The panel, connected: what is open from the extension (`context`), the account and the projects from the core over
 * the bridge, read again when either changes or the extension says the projects did, and what the person presses sent
 * back. The tab and the view of the projects chosen are kept in VS Code's state for the panel, so a reload leaves them
 * where they were.
 */
export const Panel = () => {
	const [tab, setTab] = useState<Tab>(() => vscode().getState()?.tab ?? 'projects');
	const [view, setView] = useState<View>(() => vscode().getState()?.view ?? 'grid');
	const [context, setContext] = useState<Context | null>(null);
	const [account, setAccount] = useState<SignInState>({ state: 'signedOut' });
	// Counts the times the extension said the projects changed: each reads them again.
	const [changes, setChanges] = useState(0);
	useEffect(() => {
		const stop = onHost((m) => {
			if (m.type === 'context') setContext(m.context);
			if (m.type === 'projects-changed') setChanges((n) => n + 1);
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
	const read = useWorkspace(() => workspace().listProjects(), [context?.product ?? null, login, changes], { enabled: context?.product != null });
	// With the list read: pictures for the prototypes built here that have none current, taken in once made, as the app does;
	// the newest first, so a picture drawn again is the one shown.
	const [made, setMade] = useState<MadeCover[]>([]);
	useEffect(() => {
		if (read.value === null) return;
		void workspace()
			.ensureCovers()
			.then((r) => r.ok && r.value.length > 0 && setMade((now) => [...r.value, ...now]));
	}, [read.value]);
	const projects = read.value === null ? null : withCovers(read.value, made);
	return (
		<PanelView
			tab={tab}
			onTab={(next) => {
				setTab(next);
				vscode().setState({ tab: next, view });
			}}
			view={view}
			onView={(next) => {
				setView(next);
				vscode().setState({ tab, view: next });
			}}
			account={account}
			context={context}
			projects={{ value: projects, error: read.error }}
			onOpen={(review) => vscode().postMessage({ type: 'open-review', ...review })}
			onNew={() => vscode().postMessage({ type: 'new-prototype' })}
			onGetStarted={() => vscode().postMessage({ type: 'get-started' })}
			onLocate={() => vscode().postMessage({ type: 'locate-design-system' })}
		/>
	);
};
