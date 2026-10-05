import {
	FSAlert,
	FSBox,
	FSButton,
	FSChip,
	FSIconButton,
	FSStack,
	FSTab,
	FSTabs,
	FSTextField,
	FSTooltip,
	FSTypography,
} from '@flocksafety/flock-react-component-lib';
import ChatBubbleOutline from '@mui/icons-material/ChatBubbleOutline';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ViewSidebarOutlined from '@mui/icons-material/ViewSidebarOutlined';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommentAnchor, MarkerResult, MarkerState, PinEvent, Project, ProjectIteration, ReviewComment } from '../shared/contract';
import { People } from './People';
import { PANEL_STEP, clampPanelWidth, loadPanelWidth, savePanelWidth } from './panelWidth';
import { NAV_HEIGHT } from './TopNav';

/**
 * One iteration: a thin toolbar, the preview, and a side panel that sits beside it.
 *
 * The panel is docked, not laid over the page: opening it makes the preview
 * narrower, so the page stays live and usable next to the comments. The preview is
 * a native view, so its size follows the slot it is laid on, and dragging the divider
 * hides it for the length of the drag (the pointer over a native view never reaches
 * the window, so the drag would stall the moment it crossed into the page).
 */

/** Height of the toolbar under the main bar. */
export const TOOLBAR_HEIGHT = 44;

type Mode = 'browse' | 'picking' | 'composing';
type Tab = 'build' | 'comments';

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

	// The panel is docked beside the preview. Its width is the person's to set, and is remembered.
	const [panelOpen, setPanelOpen] = useState(false);
	const [panelWidth, setPanelWidth] = useState(() => loadPanelWidth(window.innerWidth));
	const [resizing, setResizing] = useState(false);
	// A ref as well as state: pointer events can arrive faster than a render, and a handler
	// that read only the state would still see the drag as not started.
	const dragging = useRef(false);
	// Build first when there is nothing to look at yet, because that is where the preview is started.
	const [tab, setTab] = useState<Tab>(!iteration.previewUrl && build ? 'build' : 'comments');

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
				setTab('comments');
				setPanelOpen(true); // the comment is in the panel, so show it
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

	// Writing a comment happens in the panel, so it opens on the Comments tab.
	useEffect(() => {
		if (mode === 'composing') {
			setTab('comments');
			setPanelOpen(true);
		}
	}, [mode]);

	// An error is drawn in the panel, so raise it.
	useEffect(() => {
		if (error) setPanelOpen(true);
	}, [error]);

	// Dragging the divider hides the preview for the length of the drag. The pointer over a
	// native view is delivered to that view and never to this window, so without this the
	// drag would stop the moment it crossed into the page.
	useEffect(() => {
		void window.workspace.pageHold('resize', resizing);
		return () => void window.workspace.pageHold('resize', false);
	}, [resizing]);

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
	// The panel's right edge is the window's, so its width is how far the pointer is from it.
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
		if (!draft.trim()) return;
		setPosting(true);
		const r = await window.workspace.postComment(project.id, iteration.branch, draft.trim(), pending);
		setPosting(false);
		if (r.ok) {
			posted.current.set(r.value.id, r.value);
			setDraft('');
			setPending(null);
			setMode('browse');
			setPanelOpen(true); // so the comment just posted is there to see
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
				<FSTooltip title="Back to projects">
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
				{unread > 0 && (
					<FSTooltip title="Show the comments">
						<FSChip
							variant="status"
							size="small"
							icon={<ChatBubbleOutline />}
							label={String(unread)}
							onClick={() => {
								setTab('comments');
								setPanelOpen(true);
							}}
						/>
					</FSTooltip>
				)}
				<FSTooltip title={panelOpen ? 'Hide the panel' : 'Show the panel'}>
					<FSIconButton
						size="md"
						variant={panelOpen ? 'primary' : 'secondary'}
						aria-label="Toggle the side panel"
						aria-pressed={panelOpen}
						onClick={() => setPanelOpen((o) => !o)}
					>
						<ViewSidebarOutlined fontSize="small" />
					</FSIconButton>
				</FSTooltip>
			</FSBox>

			{/* Under the toolbar: the preview, and beside it the panel when it is open. */}
			<FSBox sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
				<FSBox ref={slot} sx={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden', bgcolor: 'grey.100' }}>
					{!opened && (
						<FSStack spacing={1} sx={{ p: 3, maxWidth: 640 }}>
							<FSTypography variant="body2" color="text.secondary">
								{iteration.previewUrl
									? 'Opening the preview…'
									: build
										? 'Open the panel (the icon in the toolbar) and press Run preview on the Build tab.'
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
				</FSBox>

				{panelOpen && (
					<>
						{/* The divider. Drag it, or focus it and use the arrow keys. */}
						<FSBox
							role="separator"
							aria-orientation="vertical"
							aria-label="Resize the side panel"
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
								width: 6,
								flexShrink: 0,
								cursor: 'col-resize',
								touchAction: 'none',
								bgcolor: resizing ? 'primary.main' : 'divider',
								transition: 'background-color 120ms',
								'&:hover, &:focus-visible': { bgcolor: 'primary.main' },
								outline: 'none',
							}}
						/>
						<FSBox
							sx={{
								width: panelWidth,
								flexShrink: 0,
								bgcolor: 'background.paper',
								display: 'flex',
								flexDirection: 'column',
								minHeight: 0,
							}}
						>
						<FSTabs value={tab} onChange={(_, v: Tab) => setTab(v)} variant="fullWidth" sx={{ flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
							<FSTab value="build" label="Build" />
							<FSTab value="comments" label={unread > 0 ? `Comments (${unread})` : 'Comments'} />
						</FSTabs>
						<FSStack spacing={2} sx={{ p: 2, flex: 1, minHeight: 0, overflowY: 'auto' }}>
							{error && mode !== 'composing' && <FSAlert severity="error">{error}</FSAlert>}
							{tab === 'build' && (build ?? <FSTypography variant="body2" color="text.secondary">Building is available once your Coke repository is found.</FSTypography>)}
							{tab === 'comments' && (
								<>
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
								</>
							)}
						</FSStack>
					</FSBox>
					</>
				)}
			</FSBox>
		</FSBox>
	);
};
