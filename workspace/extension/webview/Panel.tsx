import { useEffect, useMemo, useState } from 'react';
import type { Context } from '../../src/core/services/projects/findContext';
import { useComponentPictures } from './hooks/useComponentPictures';
import { useWorkspace } from './hooks/useWorkspace';
import type { ComponentPictures, MadeCover, SignInState, TokenEdit } from '../../src/shared/contract';
import { withCovers } from '../../src/shared/projectList';
import { type ChangesDialog, DesignSystem, type DesignSystemDoes } from './DesignSystem';
import { PanelDialogs } from './Dialogs';
import { asks, onHost, workspace } from './host';
import { useShared, useTokenEdits } from './shared';
import { Projects, type ProjectsRead } from './Projects';
import type { CodebaseAction, PanelDialog, Review } from '../src/messages';
import { Toggle } from './ui/Toggle';
import { type CatalogRead, useCatalog } from './useCatalog';
import { type Part, type Tab, type View, vscode } from './vscode';
import { Message } from './ui/Message';

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
	onOpenPublished: (review: Review) => void;
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
	/** The Changes dialog of the design system: open from its count, or from a component's tab. */
	changesDialog: ChangesDialog;
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
	onOpenPublished,
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
	changesDialog,
}: PanelViewProps) => (
	<main className="panel">
		<div className="panel-top">
			<Toggle label="View" options={TABS} value={tab} onChange={onTab} />
		</div>
		<section data-tab-body={tab} className="tab-body">
			{context === null ? (
				<Message size="page">Looking at what is open…</Message>
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
					onOpenPublished={onOpenPublished}
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
					changesDialog={changesDialog}
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
	// What is open, and why its design system cannot be read when it cannot: the extension's, as every page's.
	const { context, unreadable } = useShared('placed');
	// The change to the tokens being tried: the extension's, the same on every page.
	const [edits, setEdits] = useTokenEdits();
	const [account, setAccount] = useState<SignInState>({ state: 'signedOut' });
	// Counts the times the extension said the projects changed: each reads them again.
	const [changes, setChanges] = useState(0);
	// The dialog over the panel, if one is open: opened by what is pressed here or by the extension (its title bar's +).
	const [dialog, setDialog] = useState<PanelDialog | null>(null);
	useEffect(
		() =>
			onHost((m) => {
				if (m.type === 'projects-changed') setChanges((n) => n + 1);
				if (m.type === 'open-dialog') {
					setDialog(m.dialog);
					// Every change being tried is the Design System tab's: asked for from a component's tab, it is shown there.
					if (m.dialog.kind === 'changes') setTab('design-system');
				}
			}),
		[],
	);
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
	const codebase = (action: CodebaseAction, projectId: string) => void asks().codebase(action, projectId);
	// The design system, as the extension reads it for every page; its pictures while its tab is shown.
	const found = context?.designSystem ?? null;
	const showsDesign = tab === 'design-system' && found !== null && unreadable === null;
	const design = useCatalog();
	const ready = design.catalog?.state === 'ready' ? design.catalog : null;
	const pictures = useComponentPictures(showsDesign && part === 'components' && ready !== null, ready?.commit ?? null);
	const does: DesignSystemDoes = {
		sync: () => void design.sync(),
		locate: () => void asks().locateDesignSystem(),
		openComponent: (id) => void asks().openComponent(id),
		componentLink: (id, link) => void asks().componentLink(id, link),
		openPrimitives: () => void asks().openPrimitives(),
		openVoiceAndTone: () => void asks().openVoiceAndTone(),
		openTokenSource: ({ file, line }) => void asks().openLibrarySource(file, line),
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
				onOpen={(review) => void asks().openReview(review)}
				onOpenInBrowser={(review) => void asks().openReviewInBrowser(review)}
				onCopyLink={(review) => void asks().copyReviewLink(review)}
				onOpenPublished={(review) => void asks().openReviewPublished(review)}
				// Asked of the extension, which knows whether it can be started, and opens the dialog (`open-dialog`) if so.
				onNew={() => void asks().askNewPrototype()}
				onDialog={setDialog}
				onCodebase={codebase}
				onGetStarted={() => void asks().getStarted()}
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
				changesDialog={{
					open: dialog?.kind === 'changes',
					onOpen: () => setDialog({ kind: 'changes' }),
					onClose: () => setDialog(null),
				}}
			/>
			<PanelDialogs
				dialog={dialog}
				projects={projects}
				root={context?.product ?? null}
				account={account}
				onStart={({ title, task, folder }) => void asks().newPrototype(title, task, folder)}
				onCodebase={codebase}
				onChanged={() => setChanges((n) => n + 1)}
				onClose={() => setDialog(null)}
			/>
		</>
	);
};
