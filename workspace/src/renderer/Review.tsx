import { ChevronLeftIcon, ExternalLinkIcon, MapPinIcon, MessageSquareIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Checkout, CommentAnchor, MarkerResult, MarkerState, PinEvent, Project, ProjectIteration, ReviewComment } from '../shared/contract';
import { forgetPosted, markersFor, mergeComments, numberComments, openComments, sameComments } from '../shared/comments';
import { latest } from '../shared/latest';
import { People } from './People';
import { ShareControl } from './ShareControl';
import { useHostedPreview } from './hostedPreview';
import { type AddressPhase, runAddress } from './address';
import { routeWentWrong } from './localBuild';
import { PANEL_STEP, clampPanelWidth, loadPanelWidth, savePanelWidth } from './panelWidth';
import { NAV_HEIGHT } from './TopNav';
import { useLocalBuild } from './useLocalBuild';
import { Alert, AlertDescription } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';
import { Textarea } from './ui/textarea';
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
	const [mode, setMode] = useState<Mode>('browse');
	/** Whether a comment is being written. The draft pin and the box both hang off this one value. */
	const composing = mode === 'composing';
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
	/** Set when the person backs out while a pick is still being read, so its result is dropped. */
	const pickCancelled = useRef(false);
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

	useEffect(() => {
		void window.workspace.signInState().then((r) => {
			if (r.ok && r.value.state === 'signedIn') setMe(r.value.user.login);
		});
	}, []);

	// Comments posted in this window. GitHub's listings can trail a new comment, so
	// what was just posted is kept here and merged into whatever is read back.
	const posted = useRef(new Map<number, ReviewComment>());

	/**
	 * Reading the comments. `quiet` is for the background refresh: a failed check nobody asked for is
	 * not worth an error on screen.
	 *
	 * One read at a time, and never a lost one -- see `latest`. The bug it fixes was visible: opening
	 * an iteration reads on arrival and again once the preview is up, and while a request made during
	 * a read was simply dropped, the comments stayed as the first read left them until something else
	 * happened to ask. Posting a comment looked like what made an earlier one appear.
	 */
	/** True when someone asked for this read, so a failure is worth saying. Background reads are silent. */
	const asked = useRef(false);
	/**
	 * Counts the changes made from this window.
	 *
	 * GitHub answers a read as things stood *when the read began*. Resolve, move or delete something
	 * while one is in flight and that answer is already out of date when it lands: applying it puts
	 * the change back the way it was, and the comment reopens or the pin jumps back. So each change
	 * bumps this, and a read whose generation has moved on is dropped. The change stands, and the next
	 * read brings GitHub's own account of it.
	 */
	const changes = useRef(0);
	const read = useCallback(async () => {
		const loud = asked.current;
		const at = changes.current;
		asked.current = false;
		const result = await window.workspace.readComments(project.id, iteration.branch);
		if (!result.ok) {
			if (loud) setError(result.error);
			return;
		}
		// Something was changed here while this was in flight, so this answer predates it.
		if (changes.current !== at) return;
		// A read that worked clears a complaint from one that did not.
		if (loud) setError(null);
		// A comment GitHub has returned no longer needs its local copy; keeping one would hold back a
		// later change to it there.
		forgetPosted(posted.current, result.value);
		const next = mergeComments(result.value, posted.current.values());
		// Nothing new means nothing changes, so a refresh does not redraw every pin.
		setComments((prev) => (sameComments(prev, next) ? prev : next));
	}, [project.id, iteration.branch]);
	const runRead = useMemo(() => latest(read), [read]);
	const load = useCallback(
		(quiet = false) => {
			if (!quiet) asked.current = true;
			return runRead();
		},
		[runRead],
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

	// The number on a pin and the number in the file the agent reads are the same number, counted once.
	const numbers = useMemo(() => numberComments(comments ?? []), [comments]);
	const numberOf = useCallback((id: number) => numbers.get(id) ?? 0, [numbers]);

	// Only the newest open counts: an older one that finishes late must not undo, or complain about, a newer one.
	const openRun = useRef(0);
	const open = useCallback(async (url: string) => {
		const mine = ++openRun.current;
		setError(null);
		const r = await window.workspace.pageOpen(url);
		if (mine !== openRun.current) return;
		if (r.ok) {
			setOpened(true);
			// The page is up, so this is the first moment pins can be drawn on it. Read again rather
			// than draw whatever the read on arrival happened to return: that one raced the preview
			// starting, and a reviewer may have commented in between.
			void load(true);
		} else {
			setOpened(false);
			setError(r.error);
		}
	}, [load]);

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

	// Put the markers on the page. A function, not just an effect, because freezing the
	// preview for the comment box must first make sure the picture includes them.
	const drawRun = useRef(0);
	const drawMarkers = useCallback(async () => {
		// Only your own pins can be dragged; GitHub would refuse anyone else's edit anyway.
		// The pin being placed shows at once, before it is saved (id -1, amber).
		const items = markersFor(comments ?? [], numbers, me, pending ? { anchor: pending, composing } : null);
		// Several of the things this depends on can change inside one round trip to the page, so an
		// older draw must not report its results over a newer one's: what is on the page would then be
		// described by a list that is no longer what was drawn.
		const mine = ++drawRun.current;
		const r = await window.workspace.pageShowMarkers(items);
		if (mine !== drawRun.current) return;
		if (!r.ok) {
			// Said, not swallowed. The pins on the page are now whatever was there before, which may be
			// a different set from the comments listed beside them; silence would leave that looking
			// deliberate.
			setPlaced(new Map());
			setError(r.error);
			return;
		}
		setPlaced(new Map(r.value.map((m: MarkerResult) => [m.id, m.state])));
	}, [comments, numbers, pending, composing, me]);

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
						changes.current++;
						posted.current.set(r.value.id, r.value);
						setComments((cs) => (cs ?? []).map((c) => (c.id === r.value.id ? { ...c, anchor: r.value.anchor } : c)));
						// The comment now points somewhere else, and the file the agent reads says where.
						void load(true);
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
			// Reading the commit takes a moment, and Escape may have landed in it. Backing out while
			// this was in flight means there is nothing to write on: setting the pin now would leave
			// one on the page with no box, so the whole pick is dropped instead.
			if (pickCancelled.current) {
				pickCancelled.current = false;
				return;
			}
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
		if (pickActive.current) {
			// Same reason as in cancelCompose: a pick still being read must not land a pin afterwards.
			pickCancelled.current = true;
			void window.workspace.pageCancelPick();
		}
	}, []);

	/** Abandons the comment being written, and the pin with it. Comment mode carries on. */
	const cancelCompose = useCallback(() => {
		if (pickActive.current) pickCancelled.current = true;
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
			changes.current++;
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
	const total = openComments(comments ?? []).length;

	/** The agent is asked for one comment, from that comment's own button: never for a batch. */
	const addressComment = async (commentId: number) => {
		if (!checkout) return;
		setAddressLog([]);
		setAddressing(commentId);
		// Typed wider than it is assigned: the compiler cannot see that the callback below runs.
		let outcome = { kind: 'idle' } as AddressPhase;
		await runAddress({
			api: window.workspace,
			root: checkout.root,
			projectId: project.id,
			name: iteration.name,
			commentId,
			isLive: () => addressLive.current,
			onPhase: (p) => {
				outcome = p;
				if (addressLive.current) setAddress(p);
			},
		});
		if (!addressLive.current) return;
		// A change was made, and it is waiting to be looked at. Marked on the comment itself, so it
		// survives the app closing, whoever wrote the comment can see it was acted on, and nobody has
		// to remember which comments were handled. Never resolved here: whether the change is what was
		// meant is the one thing the agent cannot know.
		if (outcome.kind === 'done') {
			// Either way: a later run that changed nothing clears the mark an earlier one left, so a
			// card never shows a change waiting that is no longer there.
			const marked = await window.workspace.markAddressed(commentId, outcome.changed ? outcome.commit : null);
			if (marked.ok) {
				changes.current++;
				posted.current.set(marked.value.id, marked.value);
			}
		}
		// The agent may have changed the code, and a reviewer may have written meanwhile.
		void load(true);
	};

	// Deleting cannot be undone, so it asks first, on the card itself (a dialog would have to take the preview's place).
	const [confirmingDelete, setConfirmingDelete] = useState<number | null>(null);
	const removeComment = async (comment: ReviewComment) => {
		setError(null);
		const r = await window.workspace.deleteComment(comment.id);
		if (!r.ok) return setError(r.error);
		// Forgotten here too: comments just posted from this window are kept until a read includes them,
		// and one that stayed would come back on the next refresh.
		changes.current++;
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
		changes.current++;
		posted.current.set(r.value.id, r.value);
		setComments((cs) => (cs ?? []).map((c) => (c.id === r.value.id ? r.value : c)));
		// Same as deleting: the file the agent reads lists the open comments, and this is no longer one.
		void load(true);
	};
	// Where the comment box goes: beside the pin, in window coordinates.
	const slotBox = slot.current?.getBoundingClientRect();
	const boxPosition = slotBox
		? { top: slotBox.top + pendingAt.y + BOX_OFFSET.y, left: slotBox.left + pendingAt.x + BOX_OFFSET.x }
		: { top: 0, left: 0 };

	return (
		<div
			className="bg-background fixed inset-x-0 bottom-0 z-[1000] flex flex-col"
			// Under the main bar, so its account menu is never covered.
			style={{ top: NAV_HEIGHT }}
		>
			{/* The toolbar: where you are, and the way back. Always visible, always fixed. */}
			<div
				className="bg-card flex shrink-0 items-center gap-4 border-b px-4"
				style={{ height: TOOLBAR_HEIGHT }}
			>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button size="icon" variant="ghost" aria-label="Back to projects" className="-ml-2" onClick={onBack}>
							<ChevronLeftIcon />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Back to projects</TooltipContent>
				</Tooltip>
				<h2 className="truncate text-sm font-semibold">
					{project.title} — {iteration.name}
				</h2>
				<span className="text-muted-foreground truncate font-mono text-xs">{iteration.branch}</span>
				<People people={iteration.contributors} />
				<div className="grow" />

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							size="icon"
							variant="ghost"
							aria-label="Open this page in your browser"
							disabled={!opened}
							onClick={() => void window.workspace.openPreviewInBrowser().then((r) => !r.ok && setError(r.error))}
						>
							<ExternalLinkIcon />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Open this page in your browser</TooltipContent>
				</Tooltip>

				<ShareControl checkout={checkout} project={project} iteration={iteration} onOpenChange={setShareOpen} />

				{/* One control, two halves: comment mode on the left, the list of comments on the right.
				    A pressed half is filled rather than outlined, so which mode is on is readable at a glance. */}
				<div className="flex items-center">
					<Button
						size="sm"
						variant={commentMode ? 'default' : 'outline'}
						aria-pressed={commentMode}
						disabled={!opened}
						title="Comment: click anywhere on the page to leave one (C)"
						className="rounded-r-none"
						onClick={() => (commentMode ? exitCommentMode() : setCommentMode(true))}
					>
						<MapPinIcon />
						Comment
					</Button>
					<Button
						size="sm"
						variant={sidebarOpen ? 'default' : 'outline'}
						aria-pressed={sidebarOpen}
						aria-label="Show all comments"
						title={total > 0 ? `All comments (${total})` : 'All comments'}
						className="rounded-l-none border-l-0"
						onClick={() => setSidebarOpen((o) => !o)}
					>
						<MessageSquareIcon />
						{total > 0 ? total : null}
					</Button>
				</div>
			</div>

			{/* Under the toolbar: the preview, and beside it the sidebar when it is open. */}
			<div className="flex min-h-0 flex-1">
				<div ref={slot} className="bg-background relative min-w-0 flex-1 overflow-hidden">
					{!opened && (
						<div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
							{local.phase.kind === 'failed' && !useHosted ? (
								<>
									<Alert variant="destructive" className="max-w-[560px] text-left">
										<AlertDescription>{local.phase.message}</AlertDescription>
									</Alert>
									{local.log.length > 0 && (
										<pre className="bg-card m-0 max-h-[180px] w-full max-w-[560px] overflow-auto rounded-md border p-3 text-left text-[11px] wrap-anywhere whitespace-pre-wrap">
											{local.log.slice(-15).join('\n')}
										</pre>
									)}
									<Button onClick={local.retry}>Try again</Button>
								</>
							) : error ? (
								<Alert variant="destructive" className="max-w-[560px] text-left">
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							) : useHosted && hosted.state !== 'up' ? (
								<>
									<Spinner className="size-6" />
									<p className="text-sm">This preview is still being built.</p>
									<p className="text-muted-foreground max-w-[480px] text-sm">
										It opens here by itself as soon as it is ready. A new share takes a few minutes.
									</p>
									<Button variant="secondary" onClick={hosted.openAnyway}>
										Open it anyway
									</Button>
								</>
							) : !iteration.previewUrl && !checkout ? (
								<>
									<p className="text-sm">Flock Designer needs your Coke repository to show this.</p>
									<p className="text-muted-foreground text-sm">
										It could not find one on this machine. Point it at your Coke folder once.
									</p>
									<Button onClick={onChoose}>Find it</Button>
								</>
							) : (
								<>
									<Spinner className="size-6" />
									<p className="text-sm">
										{local.phase.kind === 'agent'
											? `Building ${project.title}…`
											: local.phase.kind === 'preview'
												? 'Starting the preview…'
												: 'Opening the preview…'}
									</p>
									{local.phase.kind === 'agent' && (
										<p className="text-muted-foreground max-w-[480px] text-sm">
											The agent is writing it from your request. This takes a few minutes.
										</p>
									)}
									{local.phase.kind === 'preview' && <p className="text-muted-foreground text-sm">The first time can take a minute.</p>}
								</>
							)}
						</div>
					)}

					{/* While a comment is being written the preview is this picture of it. */}
					{snapshot && (
						<img
							src={snapshot}
							alt="The preview, paused while a comment is written"
							className="absolute inset-0 size-full object-fill"
						/>
					)}
				</div>

				{sidebarOpen && (
					<>
						{/* The divider. Drag it, or focus it and use the arrow keys. One pixel to look at, with a
						    wider strip to grab that extends over the sidebar only: the other side is the native
						    preview, which never passes the pointer to this window. */}
						<div
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
							className={`relative w-px shrink-0 touch-none outline-none transition-colors after:absolute after:inset-y-0 after:left-0 after:w-[7px] after:cursor-col-resize after:content-[''] hover:bg-primary focus-visible:bg-primary ${
								resizing ? 'bg-primary' : 'bg-border'
							}`}
						/>
						<div className="bg-card flex min-h-0 shrink-0 flex-col" style={{ width: panelWidth }}>
							<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
								<h3 className="text-sm font-semibold">{total > 0 ? `Comments (${total})` : 'Comments'}</h3>
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
											This iteration records its work at <code>{wrongRoute.asked}</code>, but the preview opened{' '}
											<code>{wrongRoute.landedOn}</code>. The page you are looking at may not be the work. The route may have
											moved, or something redirected it.
										</AlertDescription>
									</Alert>
								)}
								{address.kind === 'running' && (
									<>
										<p className="text-muted-foreground text-xs">
											The agent is working on that comment. The preview updates as it changes the code.
										</p>
										{addressLog.length > 0 && (
											<pre className="bg-background m-0 max-h-[140px] overflow-auto rounded-md border p-2 text-[11px] wrap-anywhere whitespace-pre-wrap">
												{addressLog.slice(-8).join('\n')}
											</pre>
										)}
									</>
								)}
								{address.kind === 'done' && (
									<Alert variant={address.changed ? 'default' : 'default'}>
										<AlertDescription>
											{address.changed
												? 'The agent has finished. Look at the preview and the changes, then resolve what is done.'
												: 'The agent finished without changing anything. What it says below is why — often the change is outside this iteration, or the comment needs a decision from you.'}
											{addressLog.length > 0 && (
												<pre
													className="m-0 mt-2 overflow-auto text-[11px] wrap-anywhere whitespace-pre-wrap"
													style={{ maxHeight: address.changed ? 200 : 320 }}
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
								{comments?.length === 0 && (
									<p className="text-muted-foreground text-sm">No comments yet. Choose Comment, then click anywhere on the page.</p>
								)}
								{comments?.map((comment) => {
									/**
									 * Acted on, and waiting for this person's verdict. Such a comment is settled as far as
									 * the work goes, so the card steps back: it is faded, it offers no second run, and it
									 * says nothing about where its pin ended up -- the agent having just changed the very
									 * element it pointed at, "no longer on the page" is the expected outcome, not news.
									 * What is left is the comment, the commit, and the decision that is still theirs.
									 */
									const addressed = !comment.resolved && comment.addressedAt !== null;
									// A resolved comment is not drawn on the page at all, so whatever was last said
									// about placing it ("the element is no longer there") is about a pin that no
									// longer exists, and saying it again would be about nothing.
									const state = comment.resolved || addressed ? undefined : placed.get(comment.id);
									const n = numberOf(comment.id);
									return (
										<div
											key={comment.id}
											ref={(el: HTMLDivElement | null) => {
												if (el) cards.current.set(comment.id, el);
												else cards.current.delete(comment.id);
											}}
											onClick={() => {
												setSelected(comment.id);
												if (comment.anchor) void window.workspace.pageFocusMarker(comment.id);
											}}
											className={`rounded-lg border p-3 ${selected === comment.id ? 'border-primary bg-accent border-2' : ''} ${
												comment.anchor ? 'cursor-pointer' : ''
											} ${comment.resolved ? 'opacity-65' : ''}`}
											// What is left to do is faded, not the whole card: the two buttons that are
											// still live stay at full strength, since they are the point of it being here.
											style={{ ['--fd-fade' as string]: addressed ? 0.6 : 1 }}
										>
											<div className="flex flex-col gap-1.5">
												<div className="flex flex-row items-center gap-2">
													{n > 0 && <Badge variant="secondary">{n}</Badge>}
													<span className="fd-faded min-w-0 truncate text-sm font-medium">{comment.author}</span>
													{comment.resolved && <Badge variant="success">Resolved</Badge>}
												</div>
												{addressed && (
													<p className="text-muted-foreground text-xs">
														The agent addressed this in <code>{comment.addressedAt?.slice(0, 7)}</code>
													</p>
												)}
												{/* The actions get their own row. Three of them beside a name did not fit a narrow
												    panel, and ran together into one unreadable word. */}
												<div className="flex flex-row flex-wrap items-center gap-2">
													{/* One comment at a time: the designer picks the one that is a clear change, and
													    leaves the ones that still need a decision. */}
													{!comment.resolved && !addressed && checkout && (
														<Button
															size="sm"
															variant="ghost"
															disabled={address.kind === 'running'}
															onClick={(e: React.MouseEvent) => {
																e.stopPropagation();
																void addressComment(comment.id);
															}}
														>
															{addressing === comment.id && address.kind === 'running' ? 'Working…' : 'Address'}
														</Button>
													)}
													<Button
														size="sm"
														variant="ghost"
														onClick={(e: React.MouseEvent) => {
															e.stopPropagation();
															void setResolved(comment, !comment.resolved);
														}}
													>
														{comment.resolved ? 'Reopen' : 'Resolve'}
													</Button>
													<Button
														size="sm"
														variant="ghost"
														onClick={(e: React.MouseEvent) => {
															e.stopPropagation();
															setConfirmingDelete(comment.id);
														}}
													>
														Delete
													</Button>
												</div>
												{confirmingDelete === comment.id && (
													<div className="flex flex-row items-center gap-2" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
														<span className="text-destructive grow text-xs">Delete this comment for good? It cannot be brought back.</span>
														<Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(null)}>
															Keep
														</Button>
														<Button size="sm" variant="destructive" onClick={() => void removeComment(comment)}>
															Delete
														</Button>
													</div>
												)}
												<p className="fd-faded text-sm">{comment.body}</p>
												{comment.picture && (
													<img
														className="fd-faded max-w-[240px] rounded border"
														src={comment.picture}
														alt={`The spot comment ${n || ''} was made on`}
													/>
												)}
												{comment.anchor?.state && (
													<span className="fd-faded text-muted-foreground text-xs">State: {comment.anchor.state}</span>
												)}
												{comment.anchor && state === 'elsewhere' && (
													<span className="fd-faded text-muted-foreground text-xs">On {comment.anchor.route}</span>
												)}
												{state && NOTE[state] && <span className="text-warning text-xs">{NOTE[state]}</span>}
											</div>
										</div>
									);
								})}
							</div>
						</div>
					</>
				)}
			</div>

			{/* The comment box, beside the pin that was just placed. Positioned at window coordinates
			    rather than anchored to an element: the pin it belongs to is inside the native preview,
			    which is not part of this document. */}
			{composing && ready && boxPosition && (
				<>
					{/* Clicking away is the same as cancelling, as it was when this was a popover. */}
					<div className="fixed inset-0 z-[1100]" onClick={cancelCompose} />
					<div
						ref={composer}
						onKeyDown={(e: React.KeyboardEvent) => {
							// Cmd or Ctrl and Enter saves, as in the tools people already use.
							if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void post();
							if (e.key === 'Escape') cancelCompose();
						}}
						className="bg-popover fixed z-[1101] w-[300px] max-w-[calc(100vw-16px)] rounded-lg border p-4 shadow-lg"
						style={{ top: boxPosition.top, left: boxPosition.left }}
					>
						<div className="flex flex-col gap-3">
							{error && (
								<Alert variant="destructive">
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}
							<label htmlFor="comment-draft" className="text-sm font-medium">
								Comment
							</label>
							{/* eslint-disable-next-line jsx-a11y/no-autofocus */}
							<Textarea
								id="comment-draft"
								rows={3}
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								autoFocus
							/>
							<div className="flex flex-row justify-end gap-2">
								<Button variant="secondary" onClick={cancelCompose} disabled={posting}>
									Cancel
								</Button>
								<Button onClick={() => void post()} disabled={posting || !draft.trim()}>
									{posting ? 'Saving…' : 'Save'}
								</Button>
							</div>
						</div>
					</div>
				</>
			)}
		</div>
	);
};
