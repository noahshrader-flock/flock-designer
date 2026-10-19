import { useEffect, useMemo, useState } from 'react';
import { useComponentPictures } from './hooks/useComponentPictures';
import { useWorkspace } from './hooks/useWorkspace';
import type { MadeCover, SignInState } from '../../src/shared/contract';
import { withCovers } from '../../src/shared/projectList';
import { DesignSystem } from './DesignSystem';
import { PanelDialogs } from './Dialogs';
import { onHost, workspace } from './host';
import { useShared } from './shared';
import { Projects } from './Projects';
import type { PanelDialog } from '../src/messages';
import { Toggle } from '../../src/ui/Toggle';
import { useCatalog } from './useCatalog';
import type { View } from '../../src/ui/Collection';
import { type Part, type Tab, vscode } from './vscode';
import { Message } from '../../src/ui/Message';
import { askOnce } from './hooks/ask';

const TABS = [
	{ value: 'projects', label: 'Projects', icon: 'folder-library' },
	{ value: 'design-system', label: 'Design System', icon: 'symbol-color' },
] as const satisfies { value: Tab; label: string; icon: string }[];

/**
 * DSNR's panel: the toggle at its very top, and under it the view chosen. What is open is the extension's (`context`); the
 * account and the projects are the core's, read again when either changes or the extension says the projects did. Who is
 * signed in is VS Code's to show, in its own title bar beside the DSNR mark; the page reads it to say whose projects these
 * are, and for the account dialog. What is pressed is asked of the extension where it is pressed (`asks`). What is chosen
 * (the tab, the projects' view, the design system's part and its components' view) is kept in VS Code's state for the
 * panel, so a reload leaves it where it was.
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
		const stop = askOnce(
			() => workspace().signInState(),
			(r) => r.ok && setAccount(r.value),
		);
		const off = workspace().onSignInChanged(setAccount);
		return () => {
			stop();
			off();
		};
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
		return askOnce(
			() => workspace().ensureCovers(),
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
	// The design system, as the extension reads it for every page; its pictures while its tab is shown.
	const found = context?.designSystem ?? null;
	const showsDesign = tab === 'design-system' && found !== null && unreadable === null;
	const design = useCatalog();
	const ready = design.catalog?.state === 'ready' ? design.catalog : null;
	const pictures = useComponentPictures(showsDesign && part === 'components' && ready !== null, ready?.commit ?? null);
	return (
		<>
			<main className="panel">
				<div className="panel-top">
					<Toggle
						label="View"
						options={TABS}
						value={tab}
						onChange={(next) => {
							setTab(next);
							keep({ tab: next });
						}}
					/>
				</div>
				<section data-tab-body={tab} className="tab-body">
					{context === null ? (
						<Message size="page">Looking at what is open…</Message>
					) : tab === 'projects' ? (
						<Projects
							read={{ value: projects, error: read.error }}
							product={
								context.product !== null
									? { open: true, repository: context.productRepository }
									: { open: false, why: context.missing[0] ?? 'No product is open.' }
							}
							login={login}
							onDialog={setDialog}
							view={view}
							onView={(next) => {
								setView(next);
								keep({ view: next });
							}}
						/>
					) : (
						<DesignSystem
							found={context.designSystem}
							unreadable={unreadable}
							pictures={pictures}
							part={part}
							onPart={(next) => {
								setPart(next);
								keep({ part: next });
							}}
							view={componentsView}
							onView={(next) => {
								setComponentsView(next);
								keep({ componentsView: next });
							}}
							changesDialog={{
								open: dialog?.kind === 'changes',
								onOpen: () => setDialog({ kind: 'changes' }),
								onClose: () => setDialog(null),
							}}
						/>
					)}
				</section>
			</main>
			<PanelDialogs
				dialog={dialog}
				projects={projects}
				root={context?.product ?? null}
				account={account}
				onChanged={() => setChanges((n) => n + 1)}
				onClose={() => setDialog(null)}
			/>
		</>
	);
};
