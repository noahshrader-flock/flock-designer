import {
	FSAlert,
	FSBadge,
	FSBox,
	FSButton,
	FSChip,
	FSIconButton,
	FSStack,
	FSTextField,
	FSTooltip,
	FSTypography,
} from '@flocksafety/flock-react-component-lib';
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined';
import ViewSidebarOutlined from '@mui/icons-material/ViewSidebarOutlined';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommentAnchor, MarkerResult, MarkerState, PinEvent, Project, ProjectIteration, ReviewComment } from '../shared/contract';
import { People } from './People';
import { NAV_HEIGHT } from './TopNav';

/**
 * One iteration, full width: a thin toolbar, and under it the preview, with
 * nothing else taking its space.
 *
 * The comments, the build controls and the composer live in a panel that slides
 * in from the right. The preview is a native view, which is always drawn *above*
 * the window's own content, so a panel cannot be laid over it: while the panel is
 * open the preview is swapped for a picture of itself and the panel is drawn over
 * that, and the live preview comes back when the panel closes. Clicking the
 * picture closes the panel, which is how you get back to using the page.
 */

/** Height of the toolbar under the main bar. */
export const TOOLBAR_HEIGHT = 44;
const PANEL_WIDTH = 380;

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
	build,
	externalUrl,
}: {
	project: Project;
	iteration: ProjectIteration;
	onBack: () => void;
	/** Controls for building on this machine, shown above the comments. */
	build?: ReactNode;
	/** A preview address from somewhere else -- a local run -- to open as soon as it appears. */
	externalUrl?: string | null;
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

	// The panel is open when it was asked for (the toggle, a pin click, an error),
	// when the pointer rested at the edge, or while a comment is being written.
	const [pinned, setPinned] = useState(false);
	const [peek, setPeek] = useState(false);
	const [snapshot, setSnapshot] = useState<string | null>(null);
	const modeRef = useRef<Mode>('browse');
	const leaveTimer = useRef<ReturnType<typeof setTimeout>>();

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

	useEffect(() => {
		if (externalUrl) void open(externalUrl);
	}, [externalUrl, open]);

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
				// The comment is in the panel, so open it. It stays open until dismissed:
				// the pointer is on the page, not the panel, so a hover-open would shut at once.
				setPinned(true);
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
		// The page has to be live to be clicked, so the panel gets out of the way.
		setPinned(false);
		setPeek(false);
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
			if (e.key === 'Escape') {
				if (mode !== 'browse') void cancel();
				else {
					setPinned(false);
					setPeek(false);
				}
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [opened, mode, startComment, cancel]);

	useEffect(() => {
		modeRef.current = mode;
	}, [mode]);

	const open_ = pinned || peek || mode === 'composing';

	// An error cannot be shown over a preview that is covering the window, so
	// raise the panel, which is where errors are drawn.
	useEffect(() => {
		if (error) setPinned(true);
	}, [error]);

	/**
	 * Open panel: freeze the preview. Closed: bring it back.
	 *
	 * The order matters. Markers are drawn first so the picture includes them; the
	 * picture is on screen before the live view is hidden, so there is no flash of
	 * empty window; and a run counter drops the result of a freeze that was
	 * overtaken by the panel closing again.
	 */
	const run = useRef(0);
	useEffect(() => {
		const mine = ++run.current;
		if (!opened) {
			setSnapshot(null);
			return;
		}
		if (!open_) {
			void window.workspace.pageHold('panel', false);
			const t = setTimeout(() => {
				if (mine === run.current) setSnapshot(null);
			}, 120);
			return () => clearTimeout(t);
		}
		void (async () => {
			await drawMarkers();
			const snap = await window.workspace.pageSnapshot();
			if (mine !== run.current) return;
			setSnapshot(snap.ok ? snap.value : null);
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			if (mine !== run.current) return;
			// Even with no picture the panel has to be visible, so the preview still steps aside.
			await window.workspace.pageHold('panel', true);
		})();
	}, [open_, opened]); // eslint-disable-line react-hooks/exhaustive-deps

	// Letting go on the way out matters: the hold lives in the main process, and
	// a preview left hidden would stay hidden for the next iteration too.
	useEffect(
		() => () => {
			void window.workspace.pageHold('panel', false);
		},
		[],
	);

	// The pointer resting at the right edge of the page opens the panel. The main
	// process watches for it, because the page is a native view the window never
	// sees the pointer over. Not while placing a pin: the page has to stay live.
	useEffect(
		() =>
			window.workspace.onEdgeHover((near) => {
				if (near && modeRef.current === 'browse') setPeek(true);
			}),
		[],
	);

	// A panel that opened because the pointer rested at the edge closes when the
	// pointer leaves it. A short delay forgives a pointer that wobbles over the edge.
	const holdPeek = () => clearTimeout(leaveTimer.current);
	const releasePeek = () => {
		clearTimeout(leaveTimer.current);
		leaveTimer.current = setTimeout(() => setPeek(false), 250);
	};

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
			setPinned(true); // so the comment just posted is there to see
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
				<FSButton size="md" variant="secondary" onClick={onBack} startIcon={<ArrowBackOutlined fontSize="small" />}>
					Back
				</FSButton>
				<FSTypography variant="subtitle2" component="h2" noWrap sx={{ fontWeight: 600 }}>
					{project.title} — {iteration.name}
				</FSTypography>
				<FSTypography variant="caption" color="text.secondary" noWrap sx={{ fontFamily: 'monospace' }}>
					{iteration.branch}
				</FSTypography>
				<People people={iteration.contributors} />
				<FSBox sx={{ flexGrow: 1 }} />
				<FSTooltip title={pinned ? 'Hide comments and build' : 'Comments and build'}>
					<FSBox>
						<FSBadge badgeContent={pinned ? 0 : unread} color="primary" overlap="rectangular" max={99}>
							<FSIconButton
								size="md"
								variant={pinned ? 'primary' : 'secondary'}
								aria-label="Toggle the comments panel"
								aria-pressed={pinned}
								onClick={() => {
									setPeek(false);
									setPinned((p) => !p);
								}}
							>
								<ViewSidebarOutlined fontSize="small" />
							</FSIconButton>
						</FSBadge>
					</FSBox>
				</FSTooltip>
			</FSBox>

			{/* The preview takes everything under the toolbar. Nothing else shares its space. */}
			<FSBox ref={slot} sx={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', bgcolor: 'grey.100' }}>
				{!opened && (
					<FSStack spacing={1} sx={{ p: 3, maxWidth: 640 }}>
						<FSTypography variant="body2" color="text.secondary">
							{iteration.previewUrl
								? 'Opening the preview…'
								: build
									? 'Open the panel on the right (the icon in the toolbar) and press Run preview.'
									: 'This iteration has no preview address recorded yet. To try it, paste the address of one running on this machine, like http://localhost:3000.'}
						</FSTypography>
						{!iteration.previewUrl && !build && (
							<FSStack direction="row" spacing={1}>
								<FSTextField label="Preview address" value={urlDraft} onChange={setUrlDraft} sx={{ flexGrow: 1 }} />
								<FSButton size="md" onClick={() => void open(urlDraft)} disabled={!urlDraft.trim()}>
									Open
								</FSButton>
							</FSStack>
						)}
					</FSStack>
				)}

				{/* While the panel is open the preview is this picture of it, and a click on it closes the panel. */}
				{snapshot && open_ && (
					<img
						src={snapshot}
						alt="The preview, paused while the panel is open"
						onClick={() => {
							setPinned(false);
							setPeek(false);
						}}
						style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', cursor: 'pointer' }}
					/>
				)}

				<FSBox
					onMouseEnter={holdPeek}
					onMouseLeave={() => {
						if (!pinned && mode !== 'composing') releasePeek();
					}}
					aria-hidden={!open_}
					sx={{
						position: 'absolute',
						top: 0,
						right: 0,
						bottom: 0,
						width: PANEL_WIDTH,
						maxWidth: '100%',
						bgcolor: 'background.paper',
						borderLeft: 1,
						borderColor: 'divider',
						boxShadow: open_ ? '-8px 0 24px rgba(0,0,0,0.18)' : 'none',
						transform: open_ ? 'translateX(0)' : 'translateX(100%)',
						transition: 'transform 180ms ease',
						pointerEvents: open_ ? 'auto' : 'none',
						overflowY: 'auto',
						p: 2,
					}}
				>
					<FSStack spacing={2}>
						{error && mode !== 'composing' && <FSAlert severity="error">{error}</FSAlert>}
						{build}
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
				</FSBox>
			</FSBox>
		</FSBox>
	);
};
