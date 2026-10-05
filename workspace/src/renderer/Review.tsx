import {
	FSAlert,
	FSBox,
	FSButton,
	FSChip,
	FSIconButton,
	FSStack,
	FSTextField,
	FSTooltip,
	FSTypography,
} from '@flocksafety/flock-react-component-lib';
import ChatBubbleOutline from '@mui/icons-material/ChatBubbleOutline';
import ChevronLeft from '@mui/icons-material/ChevronLeft';
import BuildOutlined from '@mui/icons-material/BuildOutlined';
import { Popover } from '@mui/material';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommentAnchor, MarkerResult, MarkerState, PinEvent, Project, ProjectIteration, ReviewComment } from '../shared/contract';
import { People } from './People';
import { NAV_HEIGHT } from './TopNav';

/**
 * One iteration: a thin toolbar, and the preview taking everything under it.
 *
 * Build and Comments are icons in the toolbar, each opening a popover. The preview
 * is a native view, always drawn *above* the window's own content, so a popover
 * cannot be laid over it. While one is open the preview is swapped for a picture of
 * itself and the popover is drawn over that; closing the popover brings the live
 * page back. The picture is taken after the pins are drawn, and shown before the
 * live view is hidden, so nothing flashes.
 */

/** What both popovers look like. Sized to the window, so a short window scrolls instead of overflowing. */
const POPOVER_PAPER = {
	width: 380,
	maxWidth: 'calc(100vw - 16px)',
	maxHeight: 'calc(100vh - 140px)',
	mt: '6px', // clear of the toolbar's bottom line
} as const;

/** Height of the toolbar under the main bar. */
export const TOOLBAR_HEIGHT = 44;

type Mode = 'browse' | 'picking' | 'composing';
type Which = 'build' | 'comments';

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

	// Which popover is open, if any. Build first when there is nothing to look at yet,
	// because that is where the preview is started.
	const [popover, setPopover] = useState<Which | null>(!iteration.previewUrl && build ? 'build' : null);
	const [ready, setReady] = useState(false); // the preview has stepped aside, so the popover can show
	const [snapshot, setSnapshot] = useState<string | null>(null);
	const held = useRef(false);
	const anchors = useRef<Partial<Record<Which, HTMLElement | null>>>({});

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
				setPopover('comments'); // the comment is in there, so show it
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
		setPopover(null); // the page has to be live to be clicked
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

	// Writing a comment happens in the Comments popover.
	useEffect(() => {
		if (mode === 'composing') setPopover('comments');
	}, [mode]);

	// An error is drawn in a popover, so raise one: Comments if there is a page to comment on, else Build.
	useEffect(() => {
		if (error) setPopover(opened ? 'comments' : 'build');
	}, [error, opened]);

	// A preview opening is what Build was for, so get out of its way.
	useEffect(() => {
		if (opened) setPopover((p) => (p === 'build' ? null : p));
	}, [opened]);

	/**
	 * Popover open: freeze the preview. Closed: bring it back.
	 *
	 * The order matters. Markers are drawn first so the picture includes them; the picture
	 * is on screen before the live view is hidden, so there is no flash of empty window;
	 * and a run counter drops the result of a freeze that was overtaken by the popover
	 * closing again. Switching from one popover to the other keeps the same picture.
	 */
	const run = useRef(0);
	useEffect(() => {
		const mine = ++run.current;
		if (popover === null) {
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
	}, [popover, opened]); // eslint-disable-line react-hooks/exhaustive-deps

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
			setPopover('comments'); // so the comment just posted is there to see
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
				{/* Two icons, each opening a popover. The count is in the Comments popover's heading. */}
				<FSTooltip title="Build" describeChild>
					<FSBox ref={(el: HTMLDivElement | null) => void (anchors.current.build = el)}>
						<FSIconButton
							size="md"
							variant={popover === 'build' ? 'primary' : 'secondary'}
							aria-label="Build"
							aria-pressed={popover === 'build'}
							onClick={() => setPopover((p) => (p === 'build' ? null : 'build'))}
						>
							<BuildOutlined fontSize="small" />
						</FSIconButton>
					</FSBox>
				</FSTooltip>
				<FSTooltip title={unread > 0 ? `Comments (${unread})` : 'Comments'} describeChild>
					<FSBox ref={(el: HTMLDivElement | null) => void (anchors.current.comments = el)}>
						<FSIconButton
							size="md"
							variant={popover === 'comments' ? 'primary' : 'secondary'}
							aria-label="Comments"
							aria-pressed={popover === 'comments'}
							onClick={() => setPopover((p) => (p === 'comments' ? null : 'comments'))}
						>
							<ChatBubbleOutline fontSize="small" />
						</FSIconButton>
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
									? 'Press Run preview in the Build popover (the wrench in the toolbar).'
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

				{/* While a popover is open the preview is this picture of it. */}
				{snapshot && (
					<img
						src={snapshot}
						alt="The preview, paused while a popover is open"
						style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }}
					/>
				)}
			</FSBox>

			{/* Build stays mounted while closed: the agent, and the preview it starts, outlive the popover. */}
			<Popover
				keepMounted
				open={popover === 'build' && ready}
				onClose={() => setPopover(null)}
				anchorEl={anchors.current.build ?? null}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
				transformOrigin={{ vertical: 'top', horizontal: 'right' }}
				PaperProps={{ sx: POPOVER_PAPER }}
			>
				<FSStack spacing={2} sx={{ p: 2 }}>
					{error && popover === 'build' && <FSAlert severity="error">{error}</FSAlert>}
					{build ?? (
						<FSTypography variant="body2" color="text.secondary">
							Building is available once your Coke repository is found.
						</FSTypography>
					)}
				</FSStack>
			</Popover>

			<Popover
				open={popover === 'comments' && ready}
				onClose={() => setPopover(null)}
				anchorEl={anchors.current.comments ?? null}
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
