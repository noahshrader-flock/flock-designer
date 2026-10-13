import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Checkout, Project, ProjectIteration } from '../shared/contract';
import { isPrototypeKey } from '../shared/designPaths';
import { withState } from '../shared/prototypeStates';
import { workKind, workOf } from '../shared/work';
import { AssignFolder } from './AssignFolder';
import { BuildInCodebaseDialog } from './BuildInCodebaseDialog';
import { appComments, appPage } from './comments/appAdapter';
import { CommentBox } from './comments/CommentBox';
import { useComments } from './comments/useComments';
import { HandoffDialog } from './HandoffDialog';
import { useHostedPreview } from './hostedPreview';
import { usePrototypeBuild } from './prototypeBuild';
import { RecordSheet } from './RecordSheet';
import { CommentsSidebar } from './review/CommentsSidebar';
import { PreviewStatus } from './review/PreviewStatus';
import { ReviewToolbar } from './review/ReviewToolbar';
import { useAddress } from './review/useAddress';
import { useNativePreview } from './review/useNativePreview';
import { usePublishedPage } from './review/usePublishedPage';
import { useRouteCheck } from './review/useRouteCheck';
import { Alert, AlertDescription } from './ui/alert';
import { useEditor } from './useEditor';
import { useLocalBuild } from './useLocalBuild';

/**
 * One iteration: a thin toolbar, and the preview taking everything under it.
 *
 * Opening an iteration brings its preview up on this machine by itself. Commenting is a mode: the left half of the
 * toolbar's split button turns it on, and then every click on the page drops a pin with a small box beside it to write
 * in. It stays on, so you can go through the page commenting as you go. The right half opens a docked, resizable sidebar
 * listing every comment, closed until asked for. The preview is a native view, drawn above the window, so it steps aside
 * for anything drawn over it (`useNativePreview`).
 */
export const Review = ({
	project,
	iteration,
	onBack,
	checkout,
	onChoose,
	task,
	hidden,
	onOpen,
	folders = [],
}: {
	project: Project;
	iteration: ProjectIteration;
	onBack: () => void;
	/** The product repository on this machine, if one has been accepted. */
	checkout: Checkout | null;
	onChoose: () => void;
	/** For work that was just created: what the agent builds before the preview starts. */
	task?: string;
	/** Another section is showing over this screen, so the preview has to step aside. */
	hidden: boolean;
	/** Opens other work: where building a prototype in the codebase goes next. */
	onOpen: (project: Project, iteration: ProjectIteration, task?: string) => void;
	/** The folders in use, to assign this project to one (the folders plan). */
	folders?: string[];
}) => {
	const [error, setError] = useState<string | null>(null);
	const [opened, setOpened] = useState(false);
	const [route, setRoute] = useState<string | null>(null);
	// The sidebar: closed until asked for. Its width is the person's to set, and is remembered. Anything that goes wrong
	// opens it to say so: errors are shown there, and a failed pin drag or delete otherwise said nothing at all.
	const [sidebarOpen, setSidebarOpen] = useState(false);
	useEffect(() => {
		if (error !== null) setSidebarOpen(true);
	}, [error]);

	// Someone with the product repository builds it here, so what they see is their latest work. Everyone else, and anyone
	// whose local build cannot run (a colleague's iteration they do not have), opens the shared preview, which may still be
	// building. A prototype is one page the app serves itself: there is nothing to check out or run. (An older prototype
	// on an `fd/` branch is code, and opens like codebase work.)
	const prototype = isPrototypeKey(iteration.branch);
	const localBuild = useLocalBuild({ checkout, project, iteration, task, enabled: !prototype && (!iteration.previewUrl || checkout !== null) });
	const prototypeBuild = usePrototypeBuild({ project, iteration, task, enabled: prototype });
	const local = prototype ? prototypeBuild : localBuild;
	// Codebase work can be handed to the person's own editor, and the agent's conversation with it.
	const editor = useEditor(prototype ? null : checkout, iteration, local.phase.kind, setError);
	const [handedOff, setHandedOff] = useState<'editor' | 'terminal' | null>(null);
	const hostedUrl = iteration.previewUrl ?? null;
	const useHosted = hostedUrl !== null && (checkout === null || local.phase.kind === 'failed');
	const hosted = useHostedPreview(useHosted ? hostedUrl : null);
	const kind = workKind(iteration);
	const codebase = kind === 'codebase';
	// The other iterations of the same kind of work, to switch between without going back to the list.
	const siblings = workOf(project.iterations, kind);

	// What is opened over the screen: one of the project's documents (kept after it closes, so it can slide away), the
	// folder to put it in, Handoff, and building a prototype in the codebase, each confirmed in a dialog first.
	const [viewing, setViewing] = useState<{ name: string; open: boolean } | null>(null);
	const [assigning, setAssigning] = useState(false);
	const [folder, setFolder] = useState(project.folder ?? null);
	const [moving, setMoving] = useState(false);
	const [handingOff, setHandingOff] = useState(false);
	const [handoffReady, setHandoffReady] = useState<boolean | null>(null);

	// The comments: read, drawn as pins, and left, against the app's GitHub and its native preview.
	const commentStore = useMemo(
		() =>
			appComments(window.workspace, { projectId: project.id, branch: iteration.branch, name: iteration.name, commit: iteration.commit, checkout }),
		[project.id, iteration.branch, iteration.name, iteration.commit, checkout],
	);
	const commentPage = useMemo(() => appPage(window.workspace), []);
	const comments = useComments({ store: commentStore, page: commentPage, opened, route, setError, onPinClick: () => setSidebarOpen(true) });
	const { composing, load } = comments;
	const address = useAddress({ checkout, prototype, project, iteration, siblings, comments, retry: local.retry, onOpen });
	const published = usePublishedPage({ projectId: project.id, name: iteration.name, enabled: prototype, again: address.address.kind, setError });
	const preview = useNativePreview({ opened, hidden, composing, drawMarkers: comments.drawMarkers });
	const wrongRoute = useRouteCheck(opened, route, iteration.route);

	// Only the newest open counts: an older one that finishes late must not undo, or complain about, a newer one.
	const openRun = useRef(0);
	const open = useCallback(
		async (url: string) => {
			const mine = ++openRun.current;
			setError(null);
			const r = await window.workspace.pageOpen(url);
			if (mine !== openRun.current) return;
			if (r.ok) {
				setOpened(true);
				// The page is up, so this is the first moment pins can be drawn on it. Read again rather than draw whatever the
				// read on arrival happened to return: that one raced the preview starting, and a reviewer may have commented in
				// between. Asked for, not a background read: opening cleared what the first one said, so a failure is said.
				void load();
			} else {
				setOpened(false);
				setError(r.error);
			}
		},
		[load],
	);
	// The shared preview opens once it answers; the view closes when leaving.
	useEffect(() => {
		if (hostedUrl && hosted.state === 'up') void open(hostedUrl);
	}, [hostedUrl, hosted.state, open]);
	useEffect(() => () => void window.workspace.pageClose(), []);
	useEffect(() => window.workspace.onPageRoute(setRoute), []);
	// When the preview is up, show it, in the state chosen: the first, which is the page's own address, until another is.
	const states = local.phase.kind === 'running' ? (local.phase.states ?? []) : [];
	const [shownState, setShownState] = useState<string | null>(null);
	useEffect(() => {
		if (local.phase.kind === 'running') void open(withState(local.phase.url, shownState));
	}, [local.phase, shownState, open]);
	// While the agent works on an open page (Handoff), and when it reports, the screen is its, not the page's.
	useEffect(() => {
		if (local.phase.kind !== 'agent' && local.phase.kind !== 'reported') return;
		setOpened(false);
		void window.workspace.pageClose();
	}, [local.phase.kind]);
	// The verdict, from the main process: the run's last word, and HANDOFF.md committed since it started.
	useEffect(() => {
		if (local.phase.kind !== 'reported' || !checkout) return setHandoffReady(null);
		void window.workspace.handoffResult(checkout.root).then((r) => setHandoffReady(r.ok ? r.value : null));
	}, [local.phase.kind, checkout]);

	// Where the comment box goes: from the top left of the preview, in window coordinates.
	const slotBox = preview.slot.current?.getBoundingClientRect();
	const origin = slotBox ? { top: slotBox.top, left: slotBox.left } : { top: 0, left: 0 };
	const page = published.page;

	return (
		// Under the main bar, and under z-50: tooltips, menus and dialogs are portalled to the page at z-50, so a screen
		// stacked above that hides all of them (the branch tooltip, the menu, the share dialog).
		<div className="bg-background fixed inset-x-0 top-(--nav-height) bottom-0 z-40 flex flex-col">
			<ReviewToolbar
				project={project}
				iteration={iteration}
				prototype={prototype}
				kind={kind}
				siblings={siblings}
				checkout={checkout}
				phase={local.phase}
				editor={editor}
				published={published}
				states={states}
				shownState={shownState}
				onShowState={setShownState}
				comments={comments}
				listOpen={sidebarOpen}
				onToggleList={() => setSidebarOpen((o) => !o)}
				opened={opened}
				onBack={onBack}
				onOpen={onOpen}
				onHandOff={checkout && codebase ? () => setHandingOff(true) : undefined}
				onBuildInCodebase={checkout ? () => setMoving(true) : undefined}
				onViewRecord={(name) => setViewing({ name, open: true })}
				onAssignFolder={() => setAssigning(true)}
				setError={setError}
			/>

			{/* Said where it can be seen: a reason kept only in a disabled button's tooltip goes unread. */}
			{page.state === 'unpublished' && page.why && (
				<Alert variant="warning" className="rounded-none border-x-0">
					<AlertDescription>
						This is saved, but not on its page yet. It was not published because: {page.why} It is tried again by itself, or press Publish.
					</AlertDescription>
				</Alert>
			)}

			{viewing && <RecordSheet project={project} name={viewing.name} open={viewing.open} onClose={() => setViewing({ ...viewing, open: false })} />}
			<AssignFolder
				open={assigning}
				onClose={() => setAssigning(false)}
				projectId={project.id}
				folders={folders}
				folder={folder}
				onAssigned={(assigned) => {
					setFolder(assigned);
					setAssigning(false);
				}}
			/>
			{checkout && codebase && (
				<HandoffDialog open={handingOff} onClose={() => setHandingOff(false)} iteration={iteration} onStart={localBuild.handoff} />
			)}
			{checkout && prototype && (
				<BuildInCodebaseDialog open={moving} onClose={() => setMoving(false)} project={project} iteration={iteration} checkout={checkout} />
			)}

			{/* Under the toolbar: the preview, and beside it the sidebar when it is open. */}
			<div className="flex min-h-0 flex-1">
				<div ref={preview.slot} className="bg-background relative min-w-0 flex-1 overflow-hidden">
					{!opened && (
						<PreviewStatus
							project={project}
							iteration={iteration}
							prototype={prototype}
							checkout={checkout}
							phase={local.phase}
							log={local.log}
							editor={editor}
							error={error}
							handedOff={handedOff}
							onHandedOff={setHandedOff}
							handoffReady={handoffReady}
							hosted={{ shown: useHosted, up: hosted.state === 'up', openAnyway: hosted.openAnyway }}
							onRetry={local.retry}
							onSkipAgent={localBuild.skipAgent}
							onChoose={onChoose}
						/>
					)}
					{/* While a comment is being written the preview is this picture of it. */}
					{preview.snapshot && (
						<img src={preview.snapshot} alt="The preview, paused while a comment is written" className="absolute inset-0 size-full object-fill" />
					)}
				</div>
				{/* There is nothing to comment on until the page is open, so the list waits for it too. */}
				{sidebarOpen && opened && (
					<CommentsSidebar
						comments={comments}
						error={error}
						wrongRoute={wrongRoute}
						address={address}
						prototype={prototype}
						states={states}
						onShowState={setShownState}
						checkout={checkout}
						project={project}
						iteration={iteration}
					/>
				)}
			</div>

			{/* The comment box, beside the pin that was just placed. Positioned at window coordinates rather than anchored to an
			    element: the pin it belongs to is inside the native preview, which is not part of this document. */}
			{composing && preview.ready && <CommentBox comments={comments} origin={origin} error={error} />}
		</div>
	);
};
