import {
	FSAlert,
	FSBox,
	FSButton,
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
import { Popover } from '@mui/material';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Checkout, CommentAnchor, MarkerResult, MarkerState, PinEvent, Project, ProjectIteration, ReviewComment } from '../shared/contract';
import { People } from './People';
import { useLocalBuild } from './useLocalBuild';
import { NAV_HEIGHT } from './TopNav';

/**
 * One iteration: a thin toolbar, and the preview taking everything under it.
 *
 * Opening an iteration brings its preview up on this machine by itself: the screen says
 * what it is doing while it works, and shows the page when it is ready, so nobody has to
 * decide to run anything. Comments are an icon in the toolbar that opens a popover.
 *
 * The preview is a native view, always drawn *above* the window's own content, so a popover
 * cannot be laid over it. While one is open the preview is swapped for a picture of itself
 * and the popover is drawn over that; closing it brings the live page back. The picture is
 * taken after the pins are drawn, and shown before the live view is hidden, so nothing
 * flashes.
 */

/** What the popover looks like. Sized to the window, so a short window scrolls instead of overflowing. */
const POPOVER_PAPER = {
	width: 380,
	maxWidth: 'calc(100vw - 16px)',
	maxHeight: 'calc(100vh - 140px)',
	mt: '6px', // clear of the toolbar's bottom line
} as const;

/** Height of the toolbar under the main bar. */
export const TOOLBAR_HEIGHT = 44;

type Mode = 'browse' | 'picking' | 'composing';

const NOTE: Record<MarkerState, string | null> = {
	found: null,
	moved: 'The element changed, so this follows its text.',
	missing: 'The element is no longer on the page, so this is shown as a page comment.',
	elsewhere: null,
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
	const [urlDraft, setUrlDraft] = useState(iteration.previewUrl ?? '');
	const [opened, setOpened] = useState(false);
	const [route, setRoute] = useState<string | null>(null);
	const [mode, setMode] = useState<Mode>('browse');
	const [pending, setPending] = useState<CommentAnchor | null>(null);
	const [draft, setDraft] = useState('');
	const [posting, setPosting] = useState(false);
	const [placed, setPlaced] = useState<Map<number, MarkerState>>(new Map());
	const slot = useRef<HTMLDivElement>(null);
	const [me, setMe] = useState<string | null>(null);
	const [selected, setSelected] = useState<number | null>(null);
	const [redraw, setRedraw] = useState(0);
	const cards = useRef(new Map<number, HTMLElement>());

	const [commentsOpen, setCommentsOpen] = useState(false);
	const [ready, setReady] = useState(false); // the preview has stepped aside, so the popover can show
	const [snapshot, setSnapshot] = useState<string | null>(null);
	const held = useRef(false);
	const anchor = useRef<HTMLElement | null>(null);

	// Bring the iteration up here, unless it already has a hosted address to open.
	const local = useLocalBuild({ checkout, project, iteration, task, enabled: !iteration.previewUrl });

	useEffect(() => {
		void window.workspace.signInState().then((r) => {
			if (r.ok && r.value.state === 'signedIn') setMe(r.value.user.login);
		});
	}, []);

	// Comments posted in this window. GitHub's listings can trail a new comment, so
	// what was just posted is kept here and merged into whatever is read back.
	const posted = useRef(new Map<number, ReviewComment>());

	const load = useCallback(async () => {
		const result = await window.workspace.readComments(project.id, iteration.branch);
		if (!result.ok) return setError(result.error);
		const have = new Set(result.value.map((c) => c.id));
		const merged = [...result.value, ...[...posted.current.values()].filter((c) => !have.has(c.id))];
		setComments(merged.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
	}, [project.id, iteration.branch]);
	useEffect(() => void load(), [load]);

	// Numbers follow the order comments were made, and only anchored ones get one.
	const anchored = useMemo(() => (comments ?? []).filter((c) => c.anchor), [comments]);
	const numberOf = useCallback((id: number) => anchored.findIndex((c) => c.id === id) + 1, [anchored]);

	const open = useCallback(
		async (url: string) => {
			setError(null);
			const r = await window.workspace.pageOpen(url);
			if (r.ok) {
				setOpened(true);
			} else {
				setOpened(false);
				setError(r.error);
			}
		},
		[],
	);

	// Open the recorded preview straight away; close it when leaving.
	useEffect(() => {
		if (iteration.previewUrl) void open(iteration.previewUrl);
		return () => void window.workspace.pageClose();
	}, [iteration.previewUrl, open]);

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

	// Put the markers on the page. A function, not just an effect, because freezing
	// the preview for the panel must first make sure the picture includes them.
	const drawMarkers = useCallback(async () => {
		// Only your own pins can be dragged; GitHub would refuse anyone else's edit anyway.
		const items = anchored.map((c, i) => ({ id: c.id, number: i + 1, anchor: c.anchor as CommentAnchor, movable: c.author === me }));
		// The pin being placed shows at once, before it is saved (id -1, amber), and can be moved.
		if (pending) items.push({ id: -1, number: items.length + 1, anchor: pending, movable: true });
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
				setCommentsOpen(true); // the comment is in there, so show it
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

	const startComment = useCallback(async () => {
		setError(null);
		setCommentsOpen(false); // the page has to be live to be clicked
		setMode('picking');
		const r = await window.workspace.pagePick();
		if (!r.ok) {
			setError(r.error);
			setMode('browse');
		} else if (r.value) {
			setPending({ ...r.value, commit: iteration.commit ?? '' });
			setMode('composing');
		} else {
			setMode('browse');
		}
	}, [iteration.commit]);

	const cancel = useCallback(async () => {
		if (mode === 'picking') await window.workspace.pageCancelPick();
		setPending(null);
		setDraft('');
		setMode('browse');
	}, [mode]);

	// C starts comment mode, as in the tools people already use; Escape backs out.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null;
			if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
			if (e.key.toLowerCase() === 'c' && !e.metaKey && !e.ctrlKey && opened && mode === 'browse') void startComment();
			if (e.key === 'Escape' && mode !== 'browse') void cancel();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [opened, mode, startComment, cancel]);

	// Writing a comment happens in the comments popover.
	useEffect(() => {
		if (mode === 'composing') setCommentsOpen(true);
	}, [mode]);

	// A comment error is drawn in the popover, so raise it when there is a page to comment on.
	useEffect(() => {
		if (error && opened) setCommentsOpen(true);
	}, [error, opened]);

	/**
	 * Comments open: freeze the preview. Closed: bring it back.
	 *
	 * The order matters. Markers are drawn first so the picture includes them; the picture
	 * is on screen before the live view is hidden, so there is no flash of empty window;
	 * and a run counter drops the result of a freeze that was overtaken by the popover
	 * closing again.
	 */
	const run = useRef(0);
	useEffect(() => {
		const mine = ++run.current;
		if (!commentsOpen) {
			setReady(false);
			held.current = false;
			void window.workspace.pageHold('popover', false);
			const t = setTimeout(() => {
				if (mine === run.current) setSnapshot(null);
			}, 120);
			return () => clearTimeout(t);
		}
		if (!opened || held.current) {
			setReady(true); // nothing to freeze, or already frozen
			return;
		}
		void (async () => {
			await drawMarkers();
			const snap = await window.workspace.pageSnapshot();
			if (mine !== run.current) return;
			setSnapshot(snap.ok ? snap.value : null);
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			if (mine !== run.current) return;
			// Even with no picture the popover has to be visible, so the preview still steps aside.
			await window.workspace.pageHold('popover', true);
			if (mine !== run.current) return;
			held.current = true;
			setReady(true);
		})();
	}, [commentsOpen, opened]); // eslint-disable-line react-hooks/exhaustive-deps

	// Letting go on the way out matters: the hold lives in the main process, and a preview
	// left hidden would stay hidden for the next iteration too.
	useEffect(
		() => () => {
			void window.workspace.pageHold('popover', false);
		},
		[],
	);

	const post = async () => {
		if (!draft.trim()) return;
		setPosting(true);
		const r = await window.workspace.postComment(project.id, iteration.branch, draft.trim(), pending);
		setPosting(false);
		if (r.ok) {
			posted.current.set(r.value.id, r.value);
			setDraft('');
			setPending(null);
			setMode('browse');
			setCommentsOpen(true); // so the comment just posted is there to see
			await load();
		} else {
			setError(r.error);
		}
	};


	const unread = comments?.length ?? 0;

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
				<FSTooltip title={unread > 0 ? `Comments (${unread})` : 'Comments'} describeChild>
					<FSBox ref={(el: HTMLDivElement | null) => void (anchor.current = el)}>
						<FSIconButton
							size="md"
							variant={commentsOpen ? 'primary' : 'secondary'}
							aria-label="Comments"
							aria-pressed={commentsOpen}
							onClick={() => setCommentsOpen((o) => !o)}
						>
							<ChatBubbleOutline fontSize="small" />
						</FSIconButton>
					</FSBox>
				</FSTooltip>
			</FSBox>

			{/* The preview takes everything under the toolbar. Nothing else shares its space. */}
			<FSBox ref={slot} sx={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', bgcolor: 'grey.100' }}>
				{!opened && (
					<FSStack spacing={2} alignItems="center" justifyContent="center" sx={{ position: 'absolute', inset: 0, p: 3, textAlign: 'center' }}>
						{local.phase.kind === 'failed' ? (
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

				{/* While the comments are open the preview is this picture of it. */}
				{snapshot && (
					<img
						src={snapshot}
						alt="The preview, paused while the comments are open"
						style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }}
					/>
				)}
			</FSBox>

			<Popover
				open={commentsOpen && ready}
				onClose={() => setCommentsOpen(false)}
				anchorEl={anchor.current}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				transformOrigin={{ vertical: 'top', horizontal: 'right' }}
				PaperProps={{ sx: POPOVER_PAPER }}
			>
				<FSStack spacing={2} sx={{ p: 2 }}>
					<FSTypography variant="subtitle2">{unread > 0 ? `Comments (${unread})` : 'Comments'}</FSTypography>
					{error && mode !== 'composing' && <FSAlert severity="error">{error}</FSAlert>}
					<FSStack direction="row" spacing={1} alignItems="center">
						<FSButton
							size="md"
							variant={mode === 'browse' ? 'primary' : 'secondary'}
							disabled={!opened || mode === 'composing'}
							onClick={() => (mode === 'picking' ? void cancel() : void startComment())}
						>
							{mode === 'picking' ? 'Click to place a pin…' : 'Place a pin (C)'}
						</FSButton>
						{mode !== 'browse' && (
							<FSButton size="md" variant="secondary" onClick={() => void cancel()}>
								Cancel
							</FSButton>
						)}
					</FSStack>

					{mode === 'composing' && pending && (
						<FSBox sx={{ border: 1, borderColor: 'primary.main', borderRadius: 1, p: 2 }}>
							<FSStack spacing={1}>
								{error && <FSAlert severity="error">{error}</FSAlert>}
								<FSTypography variant="caption" color="text.secondary">
									Pinned on {pending.route}
								</FSTypography>
								<FSTextField label="Your comment" multiline minRows={3} value={draft} onChange={setDraft} autoFocus />
								<FSButton size="md" onClick={post} disabled={posting || !draft.trim()}>
									{posting ? 'Posting…' : 'Post comment'}
								</FSButton>
							</FSStack>
						</FSBox>
					)}

					{comments?.length === 0 && (
						<FSTypography variant="body2" color="text.secondary">
							No comments yet. Press C, then click anywhere on the page to place a pin.
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
								}}
							>
								<FSStack spacing={0.5}>
									<FSStack direction="row" spacing={1} alignItems="center">
										{n > 0 && <FSChip variant="status" size="small" label={String(n)} />}
										<FSTypography variant="subtitle2">{comment.author}</FSTypography>
										{comment.resolved && <FSChip variant="status" size="small" color="success" label="Resolved" />}
									</FSStack>
									<FSTypography variant="body2">{comment.body}</FSTypography>
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
			</Popover>
		</FSBox>
	);
};
