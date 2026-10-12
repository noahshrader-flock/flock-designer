import { CloudUploadIcon, ExternalLinkIcon, FolderIcon, GitBranchIcon, PackageCheckIcon, TriangleAlertIcon, WandSparklesIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Checkout, PageStatus, Project, ProjectIteration } from '../shared/contract';
import { READY_LINE } from '../shared/handoff';
import { withState } from '../shared/prototypeStates';
import { freshIteration, isPrototypeKey, iterationLabel, prototypeKey, prototypePagePath, workKind, workOf } from '../shared/projects';
import { IterationSwitcher, StateSwitcher } from './IterationSwitcher';
import { CommentBox } from './comments/CommentBox';
import { CommentControl } from './comments/CommentControl';
import { CommentList } from './comments/CommentList';
import { CommentsHeading } from './comments/CommentsHeading';
import { prototypeAddressed } from './comments/addressed';
import { appComments, appPage } from './comments/appAdapter';
import { useComments } from './comments/useComments';
import { HandoffDialog } from './HandoffDialog';
import { MoveToCode } from './MoveToCode';
import { RecordSheet } from './RecordSheet';
import { AccessibilityStatus } from './AccessibilityStatus';
import { AgentLog, Loading } from './Loading';
import { ShareControl } from './ShareControl';
import { AssignFolder } from './AssignFolder';
import { useOverlaps } from './overlays';
import { BackButton } from './BackButton';
import { Toolbar } from './Toolbar';
import { useHostedPreview } from './hostedPreview';
import { type AddressPhase, runAddress, runPrototypeAddress } from './address';
import { routeWentWrong } from './localBuild';
import { COMMENTS_PANEL } from './panelWidth';
import { ResizablePanel } from './ResizablePanel';
import { useLocalBuild } from './useLocalBuild';
import { useEditor } from './useEditor';
import { usePrototypeBuild } from './prototypeBuild';
import { Alert, AlertDescription } from './ui/alert';
import { Button } from './ui/button';
import { DropdownMenuItem } from './ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

/**
 * One iteration: a thin toolbar, and the preview taking everything under it.
 *
 * Opening an iteration brings its preview up on this machine by itself. Commenting is a
 * mode: the left half of the toolbar's split button turns it on, and then every click on the
 * page drops a pin with a small box beside it to write in. It stays on, so you can go through
 * the page commenting as you go. The right half opens a docked, resizable sidebar listing
 * every comment. The sidebar is closed until asked for.
 *
 * The preview is a native view, always drawn *above* the window's own content, so the comment
 * box cannot be laid over it. While one is open the preview is swapped for a picture of itself
 * (taken after the pins are drawn, shown before the live view is hidden, so nothing flashes)
 * and the box is drawn over that. Dragging the sidebar's divider hides the preview for the
 * length of the drag, because the pointer over a native view never reaches this window.
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
	/** Opens other work: where moving a prototype into the code goes next. */
	onOpen: (project: Project, iteration: ProjectIteration, task?: string) => void;
	/** The folders in use, to assign this project to one (the folders plan). */
	folders?: string[];
}) => {
	const [error, setError] = useState<string | null>(null);
	/**
	 * Something went wrong is only useful if it can be seen. Errors are shown in the sidebar, which
	 * starts shut, so a failed pin drag or delete said nothing at all: the pin snapped back and
	 * nothing explained why. Anything that goes wrong opens the sidebar to say so.
	 */
	useEffect(() => {
		if (error !== null) setSidebarOpen(true);
	}, [error]);
	const [opened, setOpened] = useState(false);
	const [route, setRoute] = useState<string | null>(null);
	const slot = useRef<HTMLDivElement>(null);

	// The sidebar: closed until asked for. Its width is the person's to set, and is remembered.
	const [sidebarOpen, setSidebarOpen] = useState(false);
	// A ref as well as state: pointer events can arrive faster than a render.

	// The comment box needs the preview out of the way; this is that handshake.
	const [ready, setReady] = useState(false);
	const [snapshot, setSnapshot] = useState<string | null>(null);
	const held = useRef(false);

	// Someone with the product repository builds it here, so what they see is their latest work.
	// Everyone else, and anyone whose local build cannot run (a colleague's iteration they do not
	// have), opens the shared preview. It may still be building: the screen says so.
	// A prototype is one page the app serves itself: there is nothing to check out or run. (An older prototype on an
	// `fd/` branch is code, and opens like codebase work.)
	const prototype = isPrototypeKey(iteration.branch);
	const localBuild = useLocalBuild({ checkout, project, iteration, task, enabled: !prototype && (!iteration.previewUrl || checkout !== null) });
	const prototypeBuild = usePrototypeBuild({ project, iteration, task, enabled: prototype });
	const local = prototype ? prototypeBuild : localBuild;
	// Codebase work can be handed to the person's own editor, and the agent's conversation with it.
	const editor = useEditor(prototype ? null : checkout, iteration, local.phase.kind, setError);
	// Set when the person took the running agent over in VS Code: the screen waits for them, not for it.
	const [handedOff, setHandedOff] = useState<'editor' | 'terminal' | null>(null);
	const hostedUrl = iteration.previewUrl ?? null;
	const useHosted = hostedUrl !== null && (checkout === null || local.phase.kind === 'failed');
	const hosted = useHostedPreview(useHosted ? hostedUrl : null);
	// One of the project's documents, read out in a panel from the side; kept after it closes so it can slide away.
	const [viewing, setViewing] = useState<{ name: string; open: boolean } | null>(null);
	// Assign folder's modal, and the folder as last assigned here: the project shown was read before it.
	const [assigning, setAssigning] = useState(false);
	const [folder, setFolder] = useState(project.folder ?? null);
	// Moving a prototype into the code is confirmed first, in a dialog (MoveToCode).
	const [moving, setMoving] = useState(false);
	const kind = workKind(iteration);
	const codebase = kind === 'codebase';
	// The other iterations of the same kind of work, to switch between without going back to the list.
	const siblings = workOf(project.iterations, kind);
	// Handoff on codebase work: confirmed in a dialog, then run on this screen, ending in a report.
	const [handingOff, setHandingOff] = useState(false);
	const [handoffReady, setHandoffReady] = useState<boolean | null>(null);

	// Asking the agent to act on the open comments. It is one agent: not while it is building this iteration.
	const [address, setAddress] = useState<AddressPhase>({ kind: 'idle' });
	const [addressLog, setAddressLog] = useState<string[]>([]);
	// Which comment this run is for, so its own button says so. Null means every open one.
	const [addressing, setAddressing] = useState<number | null>(null);
	const addressLive = useRef(true);
	useEffect(() => {
		addressLive.current = true;
		return () => void (addressLive.current = false);
	}, []);
	useEffect(() => {
		if (address.kind !== 'running') return;
		// Enough that the summary at the end survives the tool lines that came before it.
		return window.workspace.onAgentLog((l) => setAddressLog((prev) => [...prev, l.text.replace(/\n$/, '')].slice(-80)));
	}, [address.kind]);

	// The prototype's published page, when there is one: asked again whenever the window comes back to the front, since
	// a publish (from the command, or by someone else) happens outside this screen.
	const [page, setPage] = useState<PageStatus>({ state: 'none' });
	const checkPage = useCallback(
		() => void window.workspace.publishedPage(project.id, iteration.name).then((r) => r.ok && setPage(r.value)),
		[project.id, iteration.name],
	);
	useEffect(() => {
		if (!prototype) return;
		checkPage();
		window.addEventListener('focus', checkPage);
		return () => window.removeEventListener('focus', checkPage);
	}, [prototype, checkPage, address.kind]);
	const publish = () => void window.workspace.publishPage(project.id, iteration.name).then((r) => (r.ok ? setPage(r.value) : setError(r.error)));
	// While it is being published, looked at again until it is done: a deploy takes a minute or two.
	useEffect(() => {
		if (page.state !== 'publishing') return;
		const t = setTimeout(checkPage, 10_000);
		return () => clearTimeout(t);
	}, [page, checkPage]);

	// The comments: read, drawn as pins, and left, against the app's GitHub and its native preview.
	const commentStore = useMemo(
		() =>
			appComments(window.workspace, { projectId: project.id, branch: iteration.branch, name: iteration.name, commit: iteration.commit, checkout }),
		[project.id, iteration.branch, iteration.name, iteration.commit, checkout],
	);
	const commentPage = useMemo(() => appPage(window.workspace), []);
	const comments = useComments({
		store: commentStore,
		page: commentPage,
		opened,
		route,
		setError,
		onPinClick: () => setSidebarOpen(true), // the comment is in the sidebar, so show it
	});
	const { composing, load } = comments;

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
				// The page is up, so this is the first moment pins can be drawn on it. Read again rather
				// than draw whatever the read on arrival happened to return: that one raced the preview
				// starting, and a reviewer may have commented in between. Asked for, not a background read:
				// opening cleared what the first one said, so if this fails too it has to say so.
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
	const handingOffNow = local.phase.kind === 'agent' && local.phase.handoff === true;

	useEffect(() => window.workspace.onPageRoute(setRoute), []);

	/**
	 * Where the preview first settled after being sent to this iteration's recorded route. That first
	 * moment is the only one worth checking: afterwards the designer navigates wherever they like, and
	 * that is not a failure. Cleared whenever the preview is opened again.
	 */
	const [landedOn, setLandedOn] = useState<string | null>(null);
	useEffect(() => {
		if (!opened) return setLandedOn(null);
		if (route !== null) setLandedOn((seen) => seen ?? route);
	}, [opened, route]);
	const wrongRoute = useMemo(() => routeWentWrong(iteration.route, landedOn), [iteration.route, landedOn]);

	// Keep the native view on its slot, through window resizes and layout changes.
	useEffect(() => {
		if (!opened || !slot.current) return;
		const el = slot.current;
		const sync = () => {
			const r = el.getBoundingClientRect();
			void window.workspace.pageSetBounds({ x: r.left, y: r.top, width: r.width, height: r.height });
		};
		sync();
		// Layout above the slot can move it without resizing it; a light poll catches that.
		const poll = setInterval(sync, 300);
		const observer = new ResizeObserver(sync);
		observer.observe(el);
		window.addEventListener('resize', sync);
		window.addEventListener('scroll', sync, true);
		return () => {
			clearInterval(poll);
			observer.disconnect();
			window.removeEventListener('resize', sync);
			window.removeEventListener('scroll', sync, true);
		};
	}, [opened]);

	// Anything drawn over the preview needs the space it occupies: the comment box here, any tooltip, menu, dialog
	// or sheet that lands on it (they register themselves, see overlays.ts), and another section showing instead.
	const overlapped = useOverlaps(slot);
	const frozen = composing || hidden || overlapped;
	/**
	 * Frozen: the preview is swapped for a picture of itself. Thawed: the live view comes back.
	 *
	 * The order matters. Markers are drawn first so the picture includes the pin; the picture
	 * is on screen before the live view is hidden, so there is no flash of empty window; and
	 * a run counter drops the result of a freeze that was overtaken by the box closing again.
	 */
	const run = useRef(0);
	useEffect(() => {
		const mine = ++run.current;
		if (!frozen) {
			setReady(false);
			held.current = false;
			void window.workspace.pageHold('popover', false);
			const t = setTimeout(() => {
				if (mine === run.current) setSnapshot(null);
			}, 120);
			return () => clearTimeout(t);
		}
		if (!opened) {
			setReady(true); // nothing to freeze
			return;
		}
		void (async () => {
			await comments.drawMarkers();
			const snap = await window.workspace.pageSnapshot();
			if (mine !== run.current) return;
			setSnapshot(snap.ok ? snap.value : null);
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			if (mine !== run.current) return;
			// Even with no picture the box has to be visible, so the preview still steps aside.
			await window.workspace.pageHold('popover', true);
			if (mine !== run.current) return;
			held.current = true;
			setReady(true);
		})();
	}, [frozen, opened]); // eslint-disable-line react-hooks/exhaustive-deps

	// Dragging the divider hides the preview for the length of the drag (`ResizablePanel` says when); a hold left on
	// is let go on the way out.
	useEffect(() => () => void window.workspace.pageHold('resize', false), []);

	// Letting go on the way out matters: the holds live in the main process, and a preview
	// left hidden would stay hidden for the next iteration too.
	useEffect(
		() => () => {
			void window.workspace.pageHold('popover', false);
		},
		[],
	);

	/** A prototype iteration of this project, by name, as people read it. */
	const labelOf = (name: string): string => iterationLabel({ name, branch: prototypeKey(project.id, name) });
	/** Where an Address run on this prototype put its change, when that is another iteration than this one. */
	const changedElsewhere =
		address.kind === 'done' && address.changed && address.prototype && address.prototype.iteration !== iteration.name ? address.prototype : null;
	const openChanged = () => {
		if (!changedElsewhere) return;
		const known = siblings.find((i) => i.name === changedElsewhere.iteration);
		if (known) return onOpen(project, known);
		// Just made: the list this screen was opened from has not got it yet.
		if (changedElsewhere.made) {
			const made = freshIteration(changedElsewhere.made);
			onOpen({ ...project, iterations: [...project.iterations, made] }, made);
		}
	};

	/** The agent is asked for one comment, from that comment's own button: never for a batch. */
	const addressComment = async (commentId: number) => {
		if (!checkout) return;
		setAddressLog([]);
		setAddressing(commentId);
		// Typed wider than it is assigned: the compiler cannot see that the callback below runs.
		let outcome = { kind: 'idle' } as AddressPhase;
		const isLive = () => addressLive.current;
		const onPhase = (p: AddressPhase) => {
			outcome = p;
			if (addressLive.current) setAddress(p);
		};
		if (prototype) {
			// A prototype has no branch. The main process says where the change went (this iteration, or its next one
			// when others had commented on this), builds and saves it, and marks the comment with where it is.
			await runPrototypeAddress({ api: window.workspace, projectId: project.id, name: iteration.name, commentId, isLive, onPhase });
			if (!addressLive.current) return;
			if (outcome.kind === 'done' && outcome.prototype) {
				comments.showChanged(outcome.prototype.comment);
				// Changed here: what is on screen, and what reviewers open, is the changed page.
				if (outcome.changed && outcome.prototype.iteration === iteration.name) local.retry();
			}
			return void load(true);
		}
		await runAddress({ api: window.workspace, root: checkout.root, projectId: project.id, name: iteration.name, commentId, isLive, onPhase });
		if (!addressLive.current) return;
		// A change was made. Marked on the comment itself, and resolved with it, so it survives the app closing,
		// whoever wrote the comment can see it was acted on, and its pin does not stay behind pointing at what was
		// just changed. The person can reopen it if the change is not what they meant.
		if (outcome.kind === 'done') {
			// Either way: a later run that changed nothing clears the mark an earlier one left, so a
			// card never shows a change waiting that is no longer there.
			const marked = await window.workspace.markAddressed(commentId, outcome.changed ? outcome.commit : null);
			if (marked.ok) comments.showChanged(marked.value);
		}
		// The agent may have changed the code, and a reviewer may have written meanwhile.
		void load(true);
	};

	// Where the comment box goes: from the top left of the preview, in window coordinates.
	const slotBox = slot.current?.getBoundingClientRect();
	const origin = slotBox ? { top: slotBox.top, left: slotBox.left } : { top: 0, left: 0 };

	return (
		// Under the main bar, and under z-50: tooltips, menus and dialogs are portalled to the page at z-50, so a
		// screen stacked above that hides all of them (the branch tooltip, the menu, the share dialog).
		<div className="bg-background fixed inset-x-0 top-(--nav-height) bottom-0 z-40 flex flex-col">
			{/* The toolbar: where you are, and the way back. Always visible, always fixed. */}
			<Toolbar>
				<BackButton label="Back to projects" className="-mr-2 -ml-2" onClick={onBack} />
				{/* The iteration is named by the switcher beside the comments, which is always shown. */}
				<h2 className="truncate text-sm font-semibold">{project.title}</h2>
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						{prototype ? (
							<FolderIcon
								aria-label={`Saved at ${prototypePagePath(project.id, iteration.name)}`}
								className="text-muted-foreground size-4 shrink-0"
							/>
						) : (
							<GitBranchIcon aria-label={`Branch ${iteration.branch}`} className="text-muted-foreground size-4 shrink-0" />
						)}
					</TooltipTrigger>
					<TooltipContent side="bottom" className="font-mono">
						{prototype ? prototypePagePath(project.id, iteration.name) : iteration.branch}
					</TooltipContent>
				</Tooltip>
				{/* What the automated accessibility check found on the page, each time it is opened (T7): beside where it is saved. */}
				{kind === 'prototype' && (
					<AccessibilityStatus projectId={project.id} name={iteration.name} opened={local.phase.kind === 'running' ? local.phase : null} />
				)}
				<div className="grow" />
				{/* What you can do here, evenly spaced: tighter than the toolbar's own gap, so it reads as one group. */}
				<div className="flex items-center gap-2">
					{local.phase.kind === 'running' && local.phase.uncommitted && (
						<Button
							variant="ghost"
							title={`${checkout?.name ?? 'The checkout'} has changes nobody committed. ${editor.session ? 'Continue in Claude Code to finish them' : 'Open it in VS Code to look'}, or commit them yourself.`}
							onClick={() => void (editor.session ? editor.continueInClaude() : editor.openInEditor())}
						>
							<TriangleAlertIcon />
							Uncommitted changes
						</Button>
					)}
					{page.state === 'published' && (
						<Button
							title="Its page on the published site"
							onClick={() => void window.workspace.openPublishedPage(project.id, iteration.name).then((r) => !r.ok && setError(r.error))}
						>
							<ExternalLinkIcon />
							Open page
						</Button>
					)}
					{page.state === 'publishing' && (
						<Button variant="outline" disabled>
							Publishing…
						</Button>
					)}
					{(page.state === 'unpublished' || page.state === 'unavailable') && (
						// Publishing happens by itself; this is asking for it now, after it stopped or before it would.
						<Button variant="outline" title={page.why ?? 'Saved, but not on its page yet'} onClick={publish}>
							<CloudUploadIcon />
							Publish
						</Button>
					)}
					<IterationSwitcher
						current={iteration}
						siblings={siblings}
						grouped={kind === 'prototype'}
						onSelect={(next) => onOpen(project, next)}
						note={(i) => (i.localOnly && !project.localOnly ? ' · only on this machine' : '')}
					>
						<StateSwitcher states={states} current={shownState} onSelect={setShownState} />
					</IterationSwitcher>
					<CommentControl comments={comments} listOpen={sidebarOpen} onToggleList={() => setSidebarOpen((o) => !o)} disabled={!opened} />
					{/* Codebase work's next step, so it is the one filled button. */}
					{checkout && codebase && (
						<Button onClick={() => setHandingOff(true)}>
							<PackageCheckIcon />
							Hand off
						</Button>
					)}
					<ShareControl
						checkout={checkout}
						project={project}
						iteration={iteration}
						canOpen={opened}
						onOpenInBrowser={() => void window.workspace.openPreviewInBrowser().then((r) => !r.ok && setError(r.error))}
						prototype={prototype}
						onMoveToCode={checkout ? () => setMoving(true) : undefined}
						editor={editor.available ? editor : undefined}
						onViewRecord={(name) => setViewing({ name, open: true })}
						onAssignFolder={() => setAssigning(true)}
					/>
				</div>
			</Toolbar>

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
				<MoveToCode open={moving} onClose={() => setMoving(false)} project={project} iteration={iteration} checkout={checkout} />
			)}

			{/* Under the toolbar: the preview, and beside it the sidebar when it is open. */}
			<div className="flex min-h-0 flex-1">
				<div ref={slot} className="bg-background relative min-w-0 flex-1 overflow-hidden">
					{!opened && (
						<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
							{handedOff ? (
								<>
									<p className="text-sm">
										{handedOff === 'editor'
											? 'The conversation continues in VS Code.'
											: 'The command to continue the conversation is copied: paste it into a terminal.'}
									</p>
									<p className="text-muted-foreground max-w-[480px] text-sm">
										When the work is done there, open the preview to see it here and share it.
									</p>
									<Button
										onClick={() => {
											setHandedOff(null);
											localBuild.skipAgent();
										}}
									>
										Open the preview
									</Button>
								</>
							) : local.phase.kind === 'reported' ? (
								<>
									<p className="text-sm font-semibold">
										{handoffReady === null ? 'Handoff finished' : handoffReady ? READY_LINE : 'Not ready for engineering yet'}
									</p>
									<p className="text-muted-foreground max-w-[480px] text-sm">
										{handoffReady
											? `HANDOFF.md is on ${iteration.branch}. Give the branch to an engineer when you are ready; nothing was pushed.`
											: 'What the agent said is below: what it fixed, and what still stands in the way.'}
									</p>
									<AgentLog lines={local.log} />
									<div className="flex gap-2">
										{editor.session && (
											<Button variant="secondary" onClick={() => void editor.continueInClaude()}>
												Continue in Claude Code
											</Button>
										)}
										<Button onClick={localBuild.skipAgent}>Open the preview</Button>
									</div>
								</>
							) : local.phase.kind === 'failed' && !useHosted ? (
								<>
									<Alert variant="destructive" className="max-w-[560px] text-left">
										<AlertDescription>{local.phase.message}</AlertDescription>
									</Alert>
									<AgentLog lines={local.log} />
									<div className="flex gap-2">
										{editor.available && (
											<Button variant="secondary" onClick={() => void editor.openInEditor()}>
												{editor.editor ? 'Open in VS Code' : 'Show in Finder'}
											</Button>
										)}
										{editor.session && (
											<Button variant="secondary" onClick={() => void editor.continueInClaude()}>
												Continue in Claude Code
											</Button>
										)}
										<Button onClick={local.retry}>Try again</Button>
									</div>
								</>
							) : error ? (
								<Alert variant="destructive" className="max-w-[560px] text-left">
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							) : useHosted && hosted.state !== 'up' ? (
								<>
									<Loading>This preview is still being built.</Loading>
									<p className="text-muted-foreground max-w-[480px] text-sm">
										It opens here by itself as soon as it is ready. A new share takes a few minutes.
									</p>
									<Button variant="secondary" onClick={hosted.openAnyway}>
										Open it anyway
									</Button>
								</>
							) : !prototype && !iteration.previewUrl && !checkout ? (
								<>
									<p className="text-sm">DSNR needs the product repository to show this.</p>
									<p className="text-muted-foreground text-sm">It could not find one on this machine. Point it at your product repository once.</p>
									<Button onClick={onChoose}>Find it</Button>
								</>
							) : (
								<>
									<Loading>
										{handingOffNow
											? `Handing off ${project.title}…`
											: local.phase.kind === 'agent' && local.phase.accessibility
												? 'Fixing what the accessibility check found…'
												: local.phase.kind === 'agent'
													? `Building ${project.title}…`
													: local.phase.kind === 'preview'
														? 'Starting the preview…'
														: 'Opening the preview…'}
									</Loading>
									{local.phase.kind === 'agent' && (
										<>
											<p className="text-muted-foreground max-w-[480px] text-sm">
												{handingOffNow
													? 'The agent is running the full check, both reviews and the fixes they call for. This takes a while.'
													: 'The agent is writing it from your request. This takes a few minutes.'}
											</p>
											<AgentLog lines={local.log} />
											{editor.available && (
												<div className="flex gap-2">
													<Button variant="secondary" onClick={() => void editor.openInEditor()}>
														{editor.editor ? 'Open in VS Code' : 'Show in Finder'}
													</Button>
													{editor.session && (
														<Button
															variant="secondary"
															title="Stops the agent here and continues the same conversation in VS Code"
															onClick={() => void editor.continueInClaude().then(setHandedOff)}
														>
															Take over in Claude Code
														</Button>
													)}
												</div>
											)}
										</>
									)}
									{local.phase.kind === 'preview' && !prototype && <p className="text-muted-foreground text-sm">The first time can take a minute.</p>}
								</>
							)}
						</div>
					)}

					{/* While a comment is being written the preview is this picture of it. */}
					{snapshot && <img src={snapshot} alt="The preview, paused while a comment is written" className="absolute inset-0 size-full object-fill" />}
				</div>

				{/* There is nothing to comment on until the page is open, so the list waits for it too. */}
				{sidebarOpen && opened && (
					<ResizablePanel panel={COMMENTS_PANEL} label="Resize the comments sidebar" onResizing={(r) => void window.workspace.pageHold('resize', r)}>
						<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
							<CommentsHeading comments={comments} />
							{error && opened && !composing && (
								<Alert variant="destructive">
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}
							{/* The recorded route did not load. Said once, plainly: the page on screen is not the
							    work, so a comment made here would be about something this iteration never touched. */}
							{wrongRoute && !composing && (
								<Alert variant="warning">
									<AlertDescription>
										This iteration records its work at <code>{wrongRoute.asked}</code>, but the preview opened <code>{wrongRoute.landedOn}</code>. The
										page you are looking at may not be the work. The route may have moved, or something redirected it.
									</AlertDescription>
								</Alert>
							)}
							{address.kind === 'running' && (
								<>
									<p className="text-muted-foreground text-xs">
										{prototype
											? 'The agent is working on that comment. The page is rebuilt and saved when it finishes.'
											: 'The agent is working on that comment. The preview updates as it changes the code.'}
									</p>
									{addressLog.length > 0 && (
										<pre className="bg-background m-0 max-h-[140px] overflow-auto rounded-md border p-2 text-[11px] wrap-anywhere whitespace-pre-wrap">
											{addressLog.slice(-8).join('\n')}
										</pre>
									)}
								</>
							)}
							{address.kind === 'done' && (
								<Alert variant={address.changed ? 'success' : 'default'}>
									<AlertDescription>
										{changedElsewhere ? (
											<>
												Others had commented on {iterationLabel(iteration)}, so it stays as they saw it. The change is in{' '}
												{labelOf(changedElsewhere.iteration)}.{' '}
												<Button size="sm" variant="link" className="h-auto p-0" onClick={openChanged}>
													Open {labelOf(changedElsewhere.iteration)}
												</Button>
											</>
										) : address.changed ? (
											'The agent has finished. Look at the preview and the changes, then resolve what is done.'
										) : (
											'The agent finished without changing anything. What it says below is why — often the change is outside this iteration, or the comment needs a decision from you.'
										)}
										{addressLog.length > 0 && (
											<pre
												className={`m-0 mt-2 overflow-auto text-[11px] wrap-anywhere whitespace-pre-wrap ${
													address.changed ? 'max-h-[200px]' : 'max-h-[320px]'
												}`}
											>
												{/* When nothing changed, what it said is the whole answer, so less of it is cut. */}
												{addressLog.slice(address.changed ? -25 : -60).join('\n')}
											</pre>
										)}
									</AlertDescription>
								</Alert>
							)}
							{address.kind === 'failed' && (
								<Alert variant="destructive">
									<AlertDescription>{address.message}</AlertDescription>
								</Alert>
							)}
							<CommentList
								comments={comments}
								states={states}
								onShowState={setShownState}
								actions={(comment) =>
									// The agent runs on this machine, against the product repository: without it there is nothing to build with.
									!comment.resolved && checkout ? (
										<DropdownMenuItem disabled={address.kind === 'running'} onSelect={() => void addressComment(comment.id)}>
											<WandSparklesIcon />
											{addressing === comment.id && address.kind === 'running' ? 'Working…' : 'Address'}
										</DropdownMenuItem>
									) : null
								}
								addressed={(comment) =>
									// A prototype's version is a hash of its source, which means nothing to a person; a commit does.
									prototype ? (
										prototypeAddressed(comment, project.id, iteration.name)
									) : (
										<>
											The agent addressed this in <code>{comment.addressedAt?.slice(0, 7)}</code>
										</>
									)
								}
							/>
						</div>
					</ResizablePanel>
				)}
			</div>

			{/* The comment box, beside the pin that was just placed. Positioned at window coordinates
			    rather than anchored to an element: the pin it belongs to is inside the native preview,
			    which is not part of this document. */}
			{composing && ready && <CommentBox comments={comments} origin={origin} error={error} />}
		</div>
	);
};
