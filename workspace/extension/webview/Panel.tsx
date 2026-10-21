import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useDeleting } from './hooks/useDeleting';

const TABS = [
	{ value: 'projects', label: 'Projects', icon: 'folder-library' },
	{ value: 'design-system', label: 'Design System', icon: 'symbol-color' },
] as const satisfies { value: Tab; label: string; icon: string }[];

export const Panel = () => {
	const kept = vscode().getState();
	const [tab, setTab] = useState<Tab>(() => kept?.tab ?? 'projects');
	const [view, setView] = useState<View>(() => kept?.view ?? 'grid');
	const [part, setPart] = useState<Part>(() => kept?.part ?? 'components');
	const [componentsView, setComponentsView] = useState<View>(() => kept?.componentsView ?? 'grid');
	const keep = (next: Partial<{ tab: Tab; view: View; part: Part; componentsView: View }>) =>
		vscode().setState({ tab, view, part, componentsView, ...next });
	const { context, unreadable, setup } = useShared('placed');
	const [account, setAccount] = useState<SignInState>({ state: 'signedOut' });
	const [dialog, setDialog] = useState<PanelDialog | null>(null);
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
	const read = useWorkspace(() => workspace().listProjects(), [context?.product ?? null, login], { enabled: context !== null });
	// Keeps what is shown until the new list is there, so a reload never gives way to a line saying it is reading.
	const { reload } = read;
	/** A project's dialog acts on the project as it is: the list on screen may be older than a version an agent just made. */
	const openDialog = useCallback(
		(next: PanelDialog) => {
			setDialog(next);
			if ('projectId' in next) reload();
		},
		[reload],
	);
	useEffect(
		() =>
			onHost((m) => {
				if (m.type === 'projects-changed') reload();
				if (m.type === 'open-dialog') {
					openDialog(m.dialog);
					// Every change being tried is the Design System tab's: asked for from a component's tab, it is shown there.
					if (m.dialog.kind === 'changes') setTab('design-system');
				}
			}),
		[reload, openDialog],
	);
	// The newest first, so a picture drawn again is the one shown.
	const [made, setMade] = useState<MadeCover[]>([]);
	useEffect(() => {
		if (read.value === null) return;
		return askOnce(
			() => workspace().ensureCovers(),
			(r) =>
				r.ok &&
				r.value.length > 0 &&
				setMade((now) => [...r.value, ...now.filter((m) => !r.value.some((n) => n.projectId === m.projectId && n.name === m.name))]),
		);
	}, [read.value]);
	const projects = useMemo(() => (read.value === null ? null : withCovers(read.value, made)), [read.value, made]);
	// Refused, its dialog opens again to say why.
	const deletion = useDeleting(projects, reload, (projectId, error) => setDialog({ kind: 'delete', projectId, error }));
	const about = dialog !== null && 'projectId' in dialog ? dialog.projectId : null;
	useEffect(() => {
		if (about !== null && projects !== null && !projects.some((p) => p.id === about)) setDialog(null);
	}, [about, projects]);
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
						<Message size="page" waiting>
							Looking at what is open…
						</Message>
					) : tab === 'projects' ? (
						<Projects
							read={{ value: projects, error: read.error }}
							product={
								context.product !== null
									? { open: true, repository: context.productRepository }
									: { open: false, why: context.missing[0] ?? 'No product is open.' }
							}
							setup={setup}
							login={login}
							onDialog={openDialog}
							deleting={deletion.deleting}
							view={view}
							onView={(next) => {
								setView(next);
								keep({ view: next });
							}}
						/>
					) : (
						<DesignSystem
							context={context}
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
				onChanged={reload}
				onDelete={(projectId, typed) => void deletion.remove(projectId, typed)}
				onClose={() => setDialog(null)}
			/>
		</>
	);
};
