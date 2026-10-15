import { useEffect, useMemo, useState } from 'react';
import type { Context } from '../../src/main/services/findContext';
import { useComponentPictures } from '../../src/renderer/useComponentPictures';
import { useWorkspace } from '../../src/renderer/useWorkspace';
import type { ComponentPictures, MadeCover, SignInState, TokenEdit } from '../../src/shared/contract';
import { withCovers } from '../../src/shared/projectList';
import { DesignSystem, type DesignSystemDoes } from './DesignSystem';
import { PanelDialogs } from './Dialogs';
import { onHost, workspace } from './host';
import { Projects, type ProjectsRead } from './Projects';
import type { CodebaseAction, PanelDialog, Review } from '../src/messages';
import { Toggle } from './ui/Toggle';
import { type CatalogRead, useCatalog } from './useCatalog';
import { useTrial } from './useTrial';
import { type Part, type Tab, type View, vscode } from './vscode';
import { editsKept } from '../../src/shared/tokens';

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
	onOpenInBrowser: (review: Review) => void;
	onCopyLink: (review: Review) => void;
	onNew: () => void;
	onGetStarted: () => void;
	onDialog: (dialog: PanelDialog) => void;
	onCodebase: (action: CodebaseAction, projectId: string) => void;
	/** Why the design system found cannot be read, when it cannot. */
	unreadable: string | null;
	/** The design system as it is read, its pictures, its part shown and how its components are seen, and the change tried. */
	design: CatalogRead;
	pictures: ComponentPictures;
	part: Part;
	onPart: (part: Part) => void;
	componentsView: View;
	onComponentsView: (view: View) => void;
	edits: TokenEdit[];
	does: DesignSystemDoes;
}

/**
 * DSNR's panel: the toggle at its very top, and under it the view chosen. Who is signed in is VS Code's to show, in its
 * own title bar beside the DSNR mark; the page reads it to say whose projects these are, and for the account dialog.
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
	onOpenInBrowser,
	onCopyLink,
	onNew,
	onGetStarted,
	onDialog,
	onCodebase,
	unreadable,
	design,
	pictures,
	part,
	onPart,
	componentsView,
	onComponentsView,
	edits,
	does,
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
					product={
						context.product !== null
							? { open: true, repository: context.productRepository }
							: { open: false, why: context.missing[0] ?? 'No product is open.' }
					}
					login={account.state === 'signedIn' ? account.user.login : null}
					onOpen={onOpen}
					onOpenInBrowser={onOpenInBrowser}
					onCopyLink={onCopyLink}
					onNew={onNew}
					onGetStarted={onGetStarted}
					onDialog={onDialog}
					onCodebase={onCodebase}
					view={view}
					onView={onView}
				/>
			) : (
				<DesignSystem
					found={context.designSystem}
					unreadable={unreadable}
					read={design}
					pictures={pictures}
					part={part}
					onPart={onPart}
					view={componentsView}
					onView={onComponentsView}
					edits={edits}
					does={does}
				/>
			)}
		</section>
	</main>
);

/**
 * The panel, connected: what is open from the extension (`context`), the account and the projects from the core over
 * the bridge, read again when either changes or the extension says the projects did, and what the person presses sent
 * back. What is chosen (the tab, the projects' view, the design system's part and its components' view) is kept in VS
 * Code's state for the panel, so a reload leaves it where it was.
 */
export const Panel = () => {
	const kept = vscode().getState();
	const [tab, setTab] = useState<Tab>(() => kept?.tab ?? 'projects');
	const [view, setView] = useState<View>(() => kept?.view ?? 'grid');
	const [part, setPart] = useState<Part>(() => kept?.part ?? 'components');
	const [componentsView, setComponentsView] = useState<View>(() => kept?.componentsView ?? 'grid');
	// What is chosen is kept for the panel, so a reload leaves it where it was.
	const keep = (next: Partial<{ tab: Tab; view: View; part: Part; componentsView: View }>) =>
		vscode().setState({ tab, view, part, componentsView, ...next });
	const [context, setContext] = useState<Context | null>(null);
	const [unreadable, setUnreadable] = useState<string | null>(null);
	// The change to the tokens being tried: the extension's, heard before the page says it is ready.
	const [edits, setEdits] = useTrial();
	const [account, setAccount] = useState<SignInState>({ state: 'signedOut' });
	// Counts the times the extension said the projects changed: each reads them again.
	const [changes, setChanges] = useState(0);
	// The dialog over the panel, if one is open: opened by what is pressed here or by the extension (its title bar's +).
	const [dialog, setDialog] = useState<PanelDialog | null>(null);
	useEffect(() => {
		const stop = onHost((m) => {
			if (m.type === 'context') {
				setContext(m.context);
				setUnreadable(m.unreadable ?? null);
			}
			if (m.type === 'projects-changed') setChanges((n) => n + 1);
			if (m.type === 'open-dialog') setDialog(m.dialog);
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
	// Read once what is open is known, a product or none (with none, everyone's projects are listed: the workspace README's "Projects, by product").
	const read = useWorkspace(() => workspace().listProjects(), [context?.product ?? null, login], { enabled: context !== null });
	// Told the projects changed: read again, keeping what is shown until the new is there (a comment made in a review
	// is a number on its project, without the list giving way to a line saying it is reading).
	const { reload } = read;
	useEffect(() => {
		if (changes > 0) reload();
	}, [changes]); // eslint-disable-line react-hooks/exhaustive-deps
	// With the list read: pictures for the prototypes built here that have none current, taken in once made;
	// the newest first, so a picture drawn again is the one shown.
	const [made, setMade] = useState<MadeCover[]>([]);
	useEffect(() => {
		if (read.value === null) return;
		void workspace()
			.ensureCovers()
			.then(
				(r) =>
					r.ok &&
					r.value.length > 0 &&
					// One for each prototype: a picture drawn again replaces the last.
					setMade((now) => [...r.value, ...now.filter((m) => !r.value.some((n) => n.projectId === m.projectId && n.name === m.name))]),
			);
	}, [read.value]);
	const projects = useMemo(() => (read.value === null ? null : withCovers(read.value, made)), [read.value, made]);
	// A project that is not in the list once it is read is not one to open a dialog about.
	const about = dialog !== null && 'projectId' in dialog ? dialog.projectId : null;
	useEffect(() => {
		if (about !== null && projects !== null && !projects.some((p) => p.id === about)) setDialog(null);
	}, [about, projects]);
	const codebase = (action: CodebaseAction, projectId: string) => vscode().postMessage({ type: 'codebase', action, projectId });
	// The design system, read once its tab is first shown, and read afresh when another is found; its pictures while it is.
	const found = context?.designSystem ?? null;
	const showsDesign = tab === 'design-system' && found !== null && unreadable === null;
	// A sync keeps only what was tried on tokens the library still has.
	const design = useCatalog(showsDesign, found?.root ?? null, (catalog) => {
		const still = editsKept(edits, catalog);
		if (still !== edits) setEdits(still);
	});
	const ready = design.catalog?.state === 'ready' ? design.catalog : null;
	const pictures = useComponentPictures(showsDesign && part === 'components' && ready !== null, ready?.commit ?? null);
	const does: DesignSystemDoes = {
		sync: () => void design.sync(),
		locate: () => vscode().postMessage({ type: 'locate-design-system' }),
		openComponent: (id) => vscode().postMessage({ type: 'open-component', id }),
		componentLink: (id, link) => vscode().postMessage({ type: 'component-link', id, link }),
		openPrimitives: () => vscode().postMessage({ type: 'open-primitives' }),
		openVoiceAndTone: () => vscode().postMessage({ type: 'open-voice-and-tone' }),
		openTokenSource: ({ file, line }) => vscode().postMessage({ type: 'open-token-source', file, line }),
		setEdits,
	};
	return (
		<>
			<PanelView
				tab={tab}
				onTab={(next) => {
					setTab(next);
					keep({ tab: next });
				}}
				view={view}
				onView={(next) => {
					setView(next);
					keep({ view: next });
				}}
				account={account}
				context={context}
				projects={{ value: projects, error: read.error }}
				onOpen={(review) => vscode().postMessage({ type: 'open-review', ...review })}
				onOpenInBrowser={(review) => vscode().postMessage({ type: 'open-review-in-browser', ...review })}
				onCopyLink={(review) => vscode().postMessage({ type: 'copy-review-link', ...review })}
				// Asked of the extension, which knows whether it can be started, and opens the dialog (`open-dialog`) if so.
				onNew={() => vscode().postMessage({ type: 'ask-new-prototype' })}
				onDialog={setDialog}
				onCodebase={codebase}
				onGetStarted={() => vscode().postMessage({ type: 'get-started' })}
				unreadable={unreadable}
				design={design}
				pictures={pictures}
				part={part}
				onPart={(next) => {
					setPart(next);
					keep({ part: next });
				}}
				componentsView={componentsView}
				onComponentsView={(next) => {
					setComponentsView(next);
					keep({ componentsView: next });
				}}
				edits={edits}
				does={does}
			/>
			<PanelDialogs
				dialog={dialog}
				projects={projects}
				root={context?.product ?? null}
				account={account}
				onStart={(answers) => vscode().postMessage({ type: 'new-prototype', ...answers })}
				onCodebase={codebase}
				onChanged={() => setChanges((n) => n + 1)}
				onClose={() => setDialog(null)}
			/>
		</>
	);
};
