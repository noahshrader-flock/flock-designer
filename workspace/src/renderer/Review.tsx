import {
	FSAlert,
	FSBox,
	FSButton,
	FSButtonGroup,
	FSChip,
	FSIconButton,
	FSSpinner,
	FSStack,
	FSTextField,
	FSTooltip,
	FSTypography,
} from '@flocksafety/flock-react-component-lib';
import ChatBubbleOutline from '@mui/icons-material/ChatBubbleOutline';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import OpenInNew from '@mui/icons-material/OpenInNew';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import { Popover } from '@mui/material';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Checkout, CommentAnchor, MarkerResult, MarkerState, PinEvent, Project, ProjectIteration, ReviewComment } from '../shared/contract';
import { mergeComments, sameComments } from '../shared/comments';
import { People } from './People';
import { ShareControl } from './ShareControl';
import { useHostedPreview } from './hostedPreview';
import { type AddressPhase, runAddress } from './address';
import { PANEL_STEP, clampPanelWidth, loadPanelWidth, savePanelWidth } from './panelWidth';
import { NAV_HEIGHT } from './TopNav';
import { useLocalBuild } from './useLocalBuild';

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

/** Height of the toolbar under the main bar. */
export const TOOLBAR_HEIGHT = 44;

/** How often an open iteration looks for new comments. */
export const REFRESH_MS = 60_000;

/** Where the comment box sits relative to the pin, whose body is drawn above its tip. */
const BOX_OFFSET = { x: 22, y: -19 } as const;

type Mode = 'browse' | 'picking' | 'composing';

const NOTE: Record<MarkerState, string | null> = {
	found: null,
	moved: 'The element changed, so this follows its text.',
	missing: 'The element is no longer on the page, so this is shown as a page comment.',
	elsewhere: null,
	otherState: 'Made in a different state of this page. Switch to that state to see where it was.',
};

export const Review = ({
	project,
	iteration,
	onBack,
	checkout,
	onChoose,
	task,
}: {
	project: Project;
	iteration: ProjectIteration;
	onBack: () => void;
	/** The product repository on this machine, if one has been accepted. */
	checkout: Checkout | null;
	onChoose: () => void;
	/** For work that was just created: what the agent builds before the preview starts. */
	task?: string;
}) => {
	const [comments, setComments] = useState<ReviewComment[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [opened, setOpened] = useState(false);
	const [route, setRoute] = useState<string | null>(null);
	const [mode, setMode] = useState<Mode>('browse');
	const [commentMode, setCommentMode] = useState(false);
	const [pending, setPending] = useState<CommentAnchor | null>(null);
	const [pendingAt, setPendingAt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
	// The picture of the spot, taken at the click, that goes with the comment being written.
	const [pendingPicture, setPendingPicture] = useState<string | null>(null);
	const [draft, setDraft] = useState('');
	const [posting, setPosting] = useState(false);
	const [placed, setPlaced] = useState<Map<number, MarkerState>>(new Map());
	const slot = useRef<HTMLDivElement>(null);
	const [me, setMe] = useState<string | null>(null);
	const [selected, setSelected] = useState<number | null>(null);
	const [redraw, setRedraw] = useState(0);
	const cards = useRef(new Map<number, HTMLElement>());

	// The sidebar: closed until asked for. Its width is the person's to set, and is remembered.
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [panelWidth, setPanelWidth] = useState(() => loadPanelWidth(window.innerWidth));
	const [resizing, setResizing] = useState(false);
	// A ref as well as state: pointer events can arrive faster than a render.
	const dragging = useRef(false);

	// The comment box needs the preview out of the way; this is that handshake.
	const [ready, setReady] = useState(false);
	const [snapshot, setSnapshot] = useState<string | null>(null);
	const held = useRef(false);
	const pickActive = useRef(false);
	const composer = useRef<HTMLDivElement>(null);

	// Someone with the product repository builds it here, so what they see is their latest work.
	// Everyone else, and anyone whose local build cannot run (a colleague's iteration they do not
	// have), opens the shared preview. It may still be building: the screen says so.
	const local = useLocalBuild({ checkout, project, iteration, task, enabled: !iteration.previewUrl || checkout !== null });
	const hostedUrl = iteration.previewUrl ?? null;
	const useHosted = hostedUrl !== null && (checkout === null || local.phase.kind === 'failed');
	const hosted = useHostedPreview(useHosted ? hostedUrl : null);
	const [shareOpen, setShareOpen] = useState(false);

	// Asking the agent to act on the open comments. It is one agent: not while it is building this iteration.
	const [address, setAddress] = useState<AddressPhase>({ kind: 'idle' });
	const [addressLog, setAddressLog] = useState<string[]>([]);
	const addressLive = useRef(true);
	useEffect(() => {
		addressLive.current = true;
		return () => void (addressLive.current = false);
	}, []);
	useEffect(() => {
		if (address.kind !== 'running') return;
		return window.workspace.onAgentLog((l) => setAddressLog((prev) => [...prev, l.text.replace(/\n$/, '')].slice(-40)));
	}, [address.kind]);

	useEffect(() => {
		void window.workspace.signInState().then((r) => {
			if (r.ok && r.value.state === 'signedIn') setMe(r.value.user.login);
		});
	}, []);

	// Comments posted in this window. GitHub's listings can trail a new comment, so
	// what was just posted is kept here and merged into whatever is read back.
	const posted = useRef(new Map<number, ReviewComment>());

	// `quiet` is for the background refresh below: a failed check in the background is not worth an error.
	const reading = useRef(false);
	const load = useCallback(
		async (quiet = false) => {
			// One read at a time: a slow one must not be overtaken by the next tick and then overwrite it.
			if (reading.current) return;
			reading.current = true;
			try {
				const result = await window.workspace.readComments(project.id, iteration.branch);
				if (!result.ok) return quiet ? undefined : setError(result.error);
				const next = mergeComments(result.value, posted.current.values());
				// Nothing new means nothing changes, so a refresh does not redraw every pin.
				setComments((prev) => (sameComments(prev, next) ? prev : next));
			} finally {
				reading.current = false;
			}
		},
		[project.id, iteration.branch],
	);
	useEffect(() => void load(), [load]);

	// A reviewer's comment made after this was opened should appear without anyone reopening it: when the
	// window comes back into focus, and about once a minute while it is in front.
	useEffect(() => {
		const check = () => {
			if (document.visibilityState === 'visible') void load(true);
		};
		const timer = setInterval(check, REFRESH_MS);
		window.addEventListener('focus', check);
		return () => {
			clearInterval(timer);
			window.removeEventListener('focus', check);
		};
	}, [load]);

	// Numbers follow the order comments were made, and only anchored ones get one.
	const anchored = useMemo(() => (comments ?? []).filter((c) => c.anchor), [comments]);
	const numberOf = useCallback((id: number) => anchored.findIndex((c) => c.id === id) + 1, [anchored]);

	// Only the newest open counts: an older one that finishes late must not undo, or complain about, a newer one.
	const openRun = useRef(0);
	const open = useCallback(async (url: string) => {
		const mine = ++openRun.current;
		setError(null);
		const r = await window.workspace.pageOpen(url);
		if (mine !== openRun.current) return;
		if (r.ok) {
			setOpened(true);
		} else {
			setOpened(false);
			setError(r.error);
		}
	}, []);

	// The shared preview opens once it answers; the view closes when leaving.
	useEffect(() => {
		if (hostedUrl && hosted.state === 'up') void open(hostedUrl);
	}, [hostedUrl, hosted.state, open]);
	useEffect(() => () => void window.workspace.pageClose(), []);

	// When the preview is up, show it.
	useEffect(() => {
		if (local.phase.kind === 'running') void open(local.phase.url);
	}, [local.phase, open]);

	useEffect(() => window.workspace.onPageRoute(setRoute), []);

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

	// Put the markers on the page. A function, not just an effect, because freezing the
	// preview for the comment box must first make sure the picture includes them.
	const drawMarkers = useCallback(async () => {
		// Only your own pins can be dragged; GitHub would refuse anyone else's edit anyway.
		// Resolved comments have no pin, but keep their number, so "comment 3" never changes meaning.
		const items = anchored.flatMap((c, i) =>
			c.resolved ? [] : [{ id: c.id, number: i + 1, anchor: c.anchor as CommentAnchor, movable: c.author === me }],
		);
		// The pin being placed shows at once, before it is saved (id -1, amber).
		if (pending) items.push({ id: -1, number: anchored.length + 1, anchor: pending, movable: true });
		const r = await window.workspace.pageShowMarkers(items);
		if (r.ok) setPlaced(new Map(r.value.map((m: MarkerResult) => [m.id, m.state])));
	}, [anchored, pending, me]);

	// ...and again whenever the comments, the page, or the route change.
	useEffect(() => {
		if (opened) void drawMarkers();
	}, [opened, drawMarkers, route, redraw]);

	// A pin on the page was clicked or dropped somewhere new.
	useEffect(() => {
		const off = window.workspace.onPinEvent((e: PinEvent) => {
			if (e.kind === 'click') {
				if (e.id < 0) return;
				setSelected(e.id);
				setSidebarOpen(true); // the comment is in the sidebar, so show it
				setTimeout(() => cards.current.get(e.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 250);
			} else if (e.id < 0) {
				// The unsaved pin: just remember where it now is.
				setPending((p) => (p ? { ...e.anchor, commit: p.commit } : p));
			} else {
				void window.workspace.moveComment(e.id, e.anchor).then((r) => {
					if (r.ok) {
						posted.current.set(r.value.id, r.value);
						setComments((cs) => (cs ?? []).map((c) => (c.id === r.value.id ? { ...c, anchor: r.value.anchor } : c)));
					} else {
						setError(r.error);
					}
					setRedraw((n) => n + 1); // either way, draw the pin from what is saved
				});
			}
		});
		// Without this, the handler for an iteration the person has left stays live
		// and keeps acting on that iteration's comment ids.
		return off;
	}, []);

	/** Waits for one click on the page. */
	const pick = useCallback(async () => {
		// Only one at a time: React runs every effect twice in development, and a second
		// pick would cancel the first, which reads as someone pressing Escape.
		if (pickActive.current) return;
		pickActive.current = true;
		setError(null);
		setMode('picking');
		const r = await window.workspace.pagePick();
		pickActive.current = false;
		if (!r.ok) {
			setError(r.error);
			setMode('browse');
			setCommentMode(false);
		} else if (r.value) {
			// The commit the branch is at *now*, so the comment says which version it was made against.
			// The recorded one can be stale; it is only the fallback (and all a reviewer has).
			const live = checkout ? await window.workspace.iterationCommit(checkout.root, project.id, iteration.name) : null;
			setPending({ ...r.value.anchor, commit: (live?.ok && live.value) || iteration.commit || '' });
			setPendingAt(r.value.at);
			setPendingPicture(r.value.picture);
			setMode('composing');
		} else {
			// Cancelled: Escape on the page, or comment mode switched off.
			setMode('browse');
			setCommentMode(false);
		}
	}, [iteration.commit, iteration.name, project.id, checkout]);

	// Comment mode stays on: as soon as one comment is done, the next click is waited for.
	useEffect(() => {
		if (commentMode && opened && mode === 'browse') void pick();
	}, [commentMode, opened, mode, pick]);

	const exitCommentMode = useCallback(() => {
		setCommentMode(false);
		if (pickActive.current) void window.workspace.pageCancelPick();
	}, []);

	/** Abandons the comment being written, and the pin with it. Comment mode carries on. */
	const cancelCompose = useCallback(() => {
		setPending(null);
		setPendingPicture(null);
		setDraft('');
		setError(null);
		setMode('browse');
	}, []);

	// C turns comment mode on and off; Escape backs out of whatever is happening.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null;
			const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
			if (e.key === 'Escape') {
				if (mode === 'composing') cancelCompose();
				else if (commentMode) exitCommentMode();
				return;
			}
			if (typing || e.metaKey || e.ctrlKey || !opened) return;
			if (e.key.toLowerCase() === 'c') (commentMode ? exitCommentMode : () => setCommentMode(true))();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [opened, mode, commentMode, cancelCompose, exitCommentMode]);

	/**
	 * Writing a comment: freeze the preview. Done: bring it back.
	 *
	 * The order matters. Markers are drawn first so the picture includes the pin; the picture
	 * is on screen before the live view is hidden, so there is no flash of empty window; and
	 * a run counter drops the result of a freeze that was overtaken by the box closing again.
	 */
	const composing = mode === 'composing';
	// The sharing dialog needs the same thing the comment box does: the space the preview occupies.
	const frozen = composing || shareOpen;
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
			await drawMarkers();
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

	// Dragging the divider hides the preview for the length of the drag.
	useEffect(() => {
		void window.workspace.pageHold('resize', resizing);
		return () => void window.workspace.pageHold('resize', false);
	}, [resizing]);

	// Letting go on the way out matters: the holds live in the main process, and a preview
	// left hidden would stay hidden for the next iteration too.
	useEffect(
		() => () => {
			void window.workspace.pageHold('popover', false);
		},
		[],
	);

	// A narrower window may no longer have room for the width that was set.
	useEffect(() => {
		const fit = () => setPanelWidth((w) => clampPanelWidth(w, window.innerWidth));
		window.addEventListener('resize', fit);
		return () => window.removeEventListener('resize', fit);
	}, []);

	const startResize = (e: React.PointerEvent<HTMLElement>) => {
		e.preventDefault();
		try {
			// Keeps the drag attached to the divider if the pointer strays off it.
			e.currentTarget.setPointerCapture(e.pointerId);
		} catch {
			// Resizing still works without capture; it just follows the pointer less tightly.
		}
		dragging.current = true;
		setResizing(true);
	};
	// The sidebar's right edge is the window's, so its width is how far the pointer is from it.
	const moveResize = (e: React.PointerEvent<HTMLElement>) => {
		if (dragging.current) setPanelWidth(clampPanelWidth(window.innerWidth - e.clientX, window.innerWidth));
	};
	const endResize = () => {
		if (!dragging.current) return;
		dragging.current = false;
		setResizing(false);
		setPanelWidth((w) => {
			savePanelWidth(w);
			return w;
		});
	};

	const post = async () => {
		if (!draft.trim() || !pending) return;
		setPosting(true);
		const r = await window.workspace.postComment(project.id, iteration.branch, draft.trim(), pending, pendingPicture);
		setPosting(false);
		if (r.ok) {
			posted.current.set(r.value.id, r.value);
			setDraft('');
			setPending(null);
			setPendingPicture(null);
			setMode('browse'); // comment mode is still on, so the next click is waited for
			await load();
		} else {
			setError(r.error);
		}
	};

	// What is still to be dealt with. Resolved comments stay listed, but are not the count.
	const total = (comments ?? []).filter((c) => !c.resolved).length;

	const addressComments = async () => {
		if (!checkout) return;
		setAddressLog([]);
		await runAddress({
			api: window.workspace,
			root: checkout.root,
			projectId: project.id,
			name: iteration.name,
			isLive: () => addressLive.current,
			onPhase: (p) => addressLive.current && setAddress(p),
		});
		// The agent may have changed the code, and a reviewer may have written meanwhile.
		if (addressLive.current) void load(true);
	};

	// Deleting cannot be undone, so it asks first, on the card itself (a dialog would have to take the preview's place).
	const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
	const removeComment = async (comment: ReviewComment) => {
		setError(null);
		const r = await window.workspace.deleteComment(comment.id);
		if (!r.ok) return setError(r.error);
		// Forgotten here too: comments just posted from this window are kept until a read includes them,
		// and one that stayed would come back on the next refresh.
		posted.current.delete(comment.id);
		setConfirmingDelete(null);
		setSelected((s) => (s === comment.id ? null : s));
		setComments((cs) => (cs ?? []).filter((c) => c.id !== comment.id));
		void load(true); // brings comments.md up to date too
	};

	const setResolved = async (comment: ReviewComment, resolved: boolean) => {
		setError(null);
		const r = await window.workspace.resolveComment(comment.id, resolved);
		if (!r.ok) return setError(r.error);
		posted.current.set(r.value.id, r.value);
		setComments((cs) => (cs ?? []).map((c) => (c.id === r.value.id ? r.value : c)));
	};
	// Where the comment box goes: beside the pin, in window coordinates.
	const slotBox = slot.current?.getBoundingClientRect();
	const boxPosition = slotBox
		? { top: slotBox.top + pendingAt.y + BOX_OFFSET.y, left: slotBox.left + pendingAt.x + BOX_OFFSET.x }
		: { top: 0, left: 0 };

	return (
		<FSBox
			sx={{
				position: 'fixed',
				top: NAV_HEIGHT,
				left: 0,
				right: 0,
				bottom: 0,
				display: 'flex',
				flexDirection: 'column',
				bgcolor: 'background.default',
				zIndex: 1000, // under the main bar, so its account menu is never covered
			}}
		>
			{/* The toolbar: where you are, and the way back. Always visible, always fixed. */}
			<FSBox
				component="div"
				sx={{
					height: TOOLBAR_HEIGHT,
					flexShrink: 0,
					display: 'flex',
					alignItems: 'center',
					gap: 2,
					px: 2,
					bgcolor: 'background.paper',
					borderBottom: 1,
					borderColor: 'divider',
				}}
			>
				<FSTooltip title="Back to projects" describeChild>
					<FSIconButton size="md" variant="ghost" aria-label="Back to projects" onClick={onBack} sx={{ ml: -1 }}>
						<ChevronLeft />
					</FSIconButton>
				</FSTooltip>
				<FSTypography variant="subtitle2" component="h2" noWrap sx={{ fontWeight: 600 }}>
					{project.title} — {iteration.name}
				</FSTypography>
				<FSTypography variant="caption" color="text.secondary" noWrap sx={{ fontFamily: 'monospace' }}>
					{iteration.branch}
				</FSTypography>
				<People people={iteration.contributors} />
				<FSBox sx={{ flexGrow: 1 }} />

				<FSTooltip title="Open this page in your browser" describeChild>
					<span>
						<FSIconButton
							size="md"
							variant="ghost"
							aria-label="Open this page in your browser"
							disabled={!opened}
							onClick={() => void window.workspace.openPreviewInBrowser().then((r) => !r.ok && setError(r.error))}
						>
							<OpenInNew fontSize="small" />
						</FSIconButton>
					</span>
				</FSTooltip>

				<ShareControl checkout={checkout} project={project} iteration={iteration} onOpenChange={setShareOpen} />

				{/* One control, two halves: comment mode on the left, the list of comments on the right.
				    The group hands its variant and size to both buttons; pressed is the design
				    system's own secondaryActive, not a different colour of button. */}
				<FSButtonGroup size="sm" variant="secondary">
					<FSButton
						variant={commentMode ? 'secondaryActive' : 'secondary'}
						aria-pressed={commentMode}
						disabled={!opened}
						title="Comment: click anywhere on the page to leave one (C)"
						startIcon={<LocationOnOutlined fontSize="small" />}
						onClick={() => (commentMode ? exitCommentMode() : setCommentMode(true))}
					>
						Comment
					</FSButton>
					<FSButton
						variant={sidebarOpen ? 'secondaryActive' : 'secondary'}
						aria-pressed={sidebarOpen}
						aria-label="Show all comments"
						title={total > 0 ? `All comments (${total})` : 'All comments'}
						startIcon={<ChatBubbleOutline fontSize="small" />}
						onClick={() => setSidebarOpen((o) => !o)}
					>
						{total > 0 ? total : null}
					</FSButton>
				</FSButtonGroup>
			</FSBox>

			{/* Under the toolbar: the preview, and beside it the sidebar when it is open. */}
			<FSBox sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
				<FSBox ref={slot} sx={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden', bgcolor: 'background.default' }}>
					{!opened && (
						<FSStack spacing={2} alignItems="center" justifyContent="center" sx={{ position: 'absolute', inset: 0, p: 3, textAlign: 'center' }}>
							{local.phase.kind === 'failed' && !useHosted ? (
								<>
									<FSAlert severity="error" sx={{ maxWidth: 560, textAlign: 'left' }}>
										{local.phase.message}
									</FSAlert>
									{local.log.length > 0 && (
										<FSBox
											component="pre"
											sx={{ m: 0, p: 1.5, maxWidth: 560, width: '100%', maxHeight: 180, overflow: 'auto', bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1, fontSize: 11, textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
										>
											{local.log.slice(-15).join('\n')}
										</FSBox>
									)}
									<FSButton size="md" onClick={local.retry}>
										Try again
									</FSButton>
								</>
							) : error ? (
								<FSAlert severity="error" sx={{ maxWidth: 560, textAlign: 'left' }}>
									{error}
								</FSAlert>
							) : useHosted && hosted.state !== 'up' ? (
								<>
									<FSSpinner />
									<FSTypography variant="body1">This preview is still being built.</FSTypography>
									<FSTypography variant="body2" color="text.secondary" sx={{ maxWidth: 480 }}>
										It opens here by itself as soon as it is ready. A new share takes a few minutes.
									</FSTypography>
									<FSButton size="md" variant="secondary" onClick={hosted.openAnyway}>
										Open it anyway
									</FSButton>
								</>
							) : !iteration.previewUrl && !checkout ? (
								<>
									<FSTypography variant="body1">Flock Designer needs your Coke repository to show this.</FSTypography>
									<FSTypography variant="body2" color="text.secondary">
										It could not find one on this machine. Point it at your Coke folder once.
									</FSTypography>
									<FSButton size="md" onClick={onChoose}>
										Find it
									</FSButton>
								</>
							) : (
								<>
									<FSSpinner />
									<FSTypography variant="body1">
										{local.phase.kind === 'agent'
											? `Building ${project.title}…`
											: local.phase.kind === 'preview'
												? 'Starting the preview…'
												: 'Opening the preview…'}
									</FSTypography>
									{local.phase.kind === 'agent' && (
										<FSTypography variant="body2" color="text.secondary" sx={{ maxWidth: 480 }}>
											The agent is writing it from your request. This takes a few minutes.
										</FSTypography>
									)}
									{local.phase.kind === 'preview' && (
										<FSTypography variant="body2" color="text.secondary">
											The first time can take a minute.
										</FSTypography>
									)}
								</>
							)}
						</FSStack>
					)}

					{/* While a comment is being written the preview is this picture of it. */}
					{snapshot && (
						<img
							src={snapshot}
							alt="The preview, paused while a comment is written"
							style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }}
						/>
					)}
				</FSBox>

				{sidebarOpen && (
					<>
						{/* The divider. Drag it, or focus it and use the arrow keys. */}
						<FSBox
							role="separator"
							aria-orientation="vertical"
							aria-label="Resize the comments sidebar"
							aria-valuenow={panelWidth}
							tabIndex={0}
							onPointerDown={startResize}
							onPointerMove={moveResize}
							onPointerUp={endResize}
							onPointerCancel={endResize}
							onKeyDown={(e: React.KeyboardEvent) => {
								if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
								e.preventDefault();
								const next = clampPanelWidth(panelWidth + (e.key === 'ArrowLeft' ? PANEL_STEP : -PANEL_STEP), window.innerWidth);
								setPanelWidth(next);
								savePanelWidth(next);
							}}
							sx={{
								// One pixel to look at...
								width: '1px',
								flexShrink: 0,
								position: 'relative',
								touchAction: 'none',
								bgcolor: resizing ? 'primary.main' : 'divider',
								transition: 'background-color 120ms',
								'&:hover, &:focus-visible': { bgcolor: 'primary.main' },
								outline: 'none',
								// ...and a wider strip to grab. It extends over the sidebar only: the other side is
								// the native preview, which never passes the pointer to this window.
								'&::after': { content: '""', position: 'absolute', top: 0, bottom: 0, left: 0, width: '7px', cursor: 'col-resize' },
							}}
						/>
						<FSBox sx={{ width: panelWidth, flexShrink: 0, bgcolor: 'background.paper', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
							<FSStack spacing={2} sx={{ p: 2, flex: 1, minHeight: 0, overflowY: 'auto' }}>
								<FSTypography variant="subtitle2">{total > 0 ? `Comments (${total})` : 'Comments'}</FSTypography>
								{error && opened && !composing && <FSAlert severity="error">{error}</FSAlert>}
								{/* One click: the comments are read now, written to the file, and the agent is started on them. */}
								{checkout && total > 0 && (
									<FSButton
										size="md"
										onClick={() => void addressComments()}
										disabled={address.kind === 'running' || local.phase.kind === 'agent'}
									>
										{address.kind === 'running' ? 'Addressing…' : `Address ${total} comment${total === 1 ? '' : 's'}`}
									</FSButton>
								)}
								{address.kind === 'running' && (
									<>
										<FSTypography variant="caption" color="text.secondary">
											The agent is working through them. The preview updates as it changes the code.
										</FSTypography>
										{addressLog.length > 0 && (
											<FSBox component="pre" sx={{ m: 0, p: 1, maxHeight: 140, overflow: 'auto', bgcolor: 'background.default', border: 1, borderColor: 'divider', borderRadius: 1, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
												{addressLog.slice(-8).join('\n')}
											</FSBox>
										)}
									</>
								)}
								{address.kind === 'done' && (
									<FSAlert severity="success">
										The agent has finished. Look at the preview and the changes, then resolve what is done.
										{addressLog.length > 0 && (
											<FSBox component="pre" sx={{ m: 0, mt: 1, maxHeight: 200, overflow: 'auto', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
												{addressLog.slice(-25).join('\n')}
											</FSBox>
										)}
									</FSAlert>
								)}
								{address.kind === 'failed' && <FSAlert severity="error">{address.message}</FSAlert>}
								{comments?.length === 0 && (
									<FSTypography variant="body2" color="text.secondary">
										No comments yet. Choose Comment, then click anywhere on the page.
									</FSTypography>
								)}
								{comments?.map((comment) => {
									const state = placed.get(comment.id);
									const n = numberOf(comment.id);
									return (
										<FSBox
											key={comment.id}
											ref={(el: HTMLElement | null) => {
												if (el) cards.current.set(comment.id, el);
												else cards.current.delete(comment.id);
											}}
											onClick={() => {
												setSelected(comment.id);
												if (comment.anchor) void window.workspace.pageFocusMarker(comment.id);
											}}
											sx={{
												border: 1,
												borderColor: selected === comment.id ? 'primary.main' : 'divider',
												borderWidth: selected === comment.id ? 2 : 1,
												bgcolor: selected === comment.id ? 'action.selected' : undefined,
												borderRadius: 1,
												p: 1.5,
												cursor: comment.anchor ? 'pointer' : 'default',
												opacity: comment.resolved ? 0.65 : 1,
											}}
										>
											<FSStack spacing={0.5}>
												<FSStack direction="row" spacing={1} alignItems="center">
													{n > 0 && <FSChip variant="status" size="small" label={String(n)} />}
													<FSTypography variant="subtitle2">{comment.author}</FSTypography>
													{comment.resolved && <FSChip variant="status" size="small" color="success" label="Resolved" />}
													<FSBox sx={{ flexGrow: 1 }} />
													<FSButton
														size="sm"
														variant="ghost"
														onClick={(e: React.MouseEvent) => {
															e.stopPropagation();
															void setResolved(comment, !comment.resolved);
														}}
													>
														{comment.resolved ? 'Reopen' : 'Resolve'}
													</FSButton>
													<FSButton
														size="sm"
														variant="ghost"
														onClick={(e: React.MouseEvent) => {
															e.stopPropagation();
															setConfirmingDelete(comment.id);
														}}
													>
														Delete
													</FSButton>
												</FSStack>
												{confirmingDelete === comment.id && (
													<FSStack
														direction="row"
														spacing={1}
														alignItems="center"
														onClick={(e: React.MouseEvent) => e.stopPropagation()}
													>
														<FSTypography variant="caption" color="error" sx={{ flexGrow: 1 }}>
															Delete this comment for good? It cannot be brought back.
														</FSTypography>
														<FSButton size="sm" variant="ghost" onClick={() => setConfirmingDelete(null)}>
															Keep
														</FSButton>
														<FSButton size="sm" variant="secondary" onClick={() => void removeComment(comment)}>
															Delete
														</FSButton>
													</FSStack>
												)}
												<FSTypography variant="body2">{comment.body}</FSTypography>
												{comment.picture && (
													<img
														src={comment.picture}
														alt={`The spot comment ${n || ''} was made on`}
														style={{ width: '100%', maxWidth: 240, borderRadius: 4, border: '1px solid rgba(128,128,128,0.4)' }}
													/>
												)}
												{comment.anchor?.state && (
													<FSTypography variant="caption" color="text.secondary">
														State: {comment.anchor.state}
													</FSTypography>
												)}
												{comment.anchor && state === 'elsewhere' && (
													<FSTypography variant="caption" color="text.secondary">
														On {comment.anchor.route}
													</FSTypography>
												)}
												{state && NOTE[state] && (
													<FSTypography variant="caption" color="warning.main">
														{NOTE[state]}
													</FSTypography>
												)}
											</FSStack>
										</FSBox>
									);
								})}
							</FSStack>
						</FSBox>
					</>
				)}
			</FSBox>

			{/* The comment box, beside the pin that was just placed. */}
			<Popover
				open={composing && ready}
				onClose={cancelCompose}
				anchorReference="anchorPosition"
				anchorPosition={boxPosition}
				transformOrigin={{ vertical: 'center', horizontal: 'left' }}
				PaperProps={{ sx: { width: 300, maxWidth: 'calc(100vw - 16px)' } }}
				// The popover moves focus to its own frame as it opens, which can override the input's
				// autoFocus; so once it has finished opening, put the cursor in the input explicitly.
				TransitionProps={{ onEntered: () => composer.current?.querySelector('textarea')?.focus() }}
			>
				{/* Cmd or Ctrl and Enter saves, as in the tools people already use. */}
				<FSBox
					ref={composer}
					onKeyDown={(e: React.KeyboardEvent) => {
						if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void post();
					}}
					sx={{ p: 2 }}
				>
					<FSStack spacing={1.5}>
						{error && <FSAlert severity="error">{error}</FSAlert>}
						<FSTextField label="Comment" multiline minRows={3} value={draft} onChange={setDraft} autoFocus />
						<FSStack direction="row" spacing={1} justifyContent="flex-end">
							<FSButton size="md" variant="secondary" onClick={cancelCompose} disabled={posting}>
								Cancel
							</FSButton>
							<FSButton size="md" onClick={() => void post()} disabled={posting || !draft.trim()}>
								{posting ? 'Saving…' : 'Save'}
							</FSButton>
						</FSStack>
					</FSStack>
				</FSBox>
			</Popover>
		</FSBox>
	);
};
