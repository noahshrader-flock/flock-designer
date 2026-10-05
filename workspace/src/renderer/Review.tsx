import { FSAlert, FSBox, FSButton, FSChip, FSStack, FSTextField, FSTypography } from '@flocksafety/flock-react-component-lib';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommentAnchor, MarkerResult, MarkerState, PinEvent, Project, ProjectIteration, ReviewComment } from '../shared/contract';

/**
 * One iteration: its preview, and the comments placed on it.
 *
 * The preview is a native view the main process lays over the grey box on the
 * left, so everything that has to appear *over* the page -- the numbered
 * markers -- is drawn inside the page by the app, and everything else lives in
 * the panel on the right. The page itself is given no way to call this window.
 */

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
	header,
}: {
	project: Project;
	iteration: ProjectIteration;
	onBack: () => void;
	header: ReactNode;
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
		const observer = new ResizeObserver(sync);
		observer.observe(el);
		window.addEventListener('resize', sync);
		window.addEventListener('scroll', sync, true);
		return () => {
			observer.disconnect();
			window.removeEventListener('resize', sync);
			window.removeEventListener('scroll', sync, true);
		};
	}, [opened]);

	// Put the markers on the page whenever the comments, the page, or the route change.
	useEffect(() => {
		if (!opened) return;
		void (async () => {
			// Only your own pins can be dragged; GitHub would refuse anyone else's edit anyway.
			const items = anchored.map((c, i) => ({ id: c.id, number: i + 1, anchor: c.anchor as CommentAnchor, movable: c.author === me }));
			// The pin being placed shows at once, before it is saved (id -1, amber), and can be moved.
			if (pending) items.push({ id: -1, number: items.length + 1, anchor: pending, movable: true });
			const r = await window.workspace.pageShowMarkers(items);
			if (r.ok) setPlaced(new Map(r.value.map((m: MarkerResult) => [m.id, m.state])));
		})();
	}, [opened, anchored, route, pending, me, redraw]);

	// A pin on the page was clicked or dropped somewhere new.
	useEffect(
		() =>
			window.workspace.onPinEvent((e: PinEvent) => {
				if (e.kind === 'click') {
					if (e.id < 0) return;
					setSelected(e.id);
					cards.current.get(e.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
			}),
		[],
	);

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
			await load();
		} else {
			setError(r.error);
		}
	};

	return (
		<FSStack spacing={2}>
			<FSStack direction="row" alignItems="center" spacing={2}>
				<FSButton variant="secondary" onClick={onBack}>
					Back
				</FSButton>
				<FSTypography variant="h6" component="h2">
					{project.title} — {iteration.name}
				</FSTypography>
			</FSStack>
			{header}
			{error && mode !== 'composing' && <FSAlert severity="error">{error}</FSAlert>}

			<FSStack direction="row" spacing={2} alignItems="stretch">
				<FSBox
					ref={slot}
					sx={{ flex: 1, minWidth: 0, height: 'calc(100vh - 260px)', minHeight: 480, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'grey.100' }}
				>
					{!opened && (
						<FSStack spacing={1} sx={{ p: 2 }}>
							<FSTypography variant="body2" color="text.secondary">
								{iteration.previewUrl
									? 'Opening the preview…'
									: 'This iteration has no preview address recorded yet. To try it, paste the address of one running on this machine, like http://localhost:3000.'}
							</FSTypography>
							{!iteration.previewUrl && (
								<FSStack direction="row" spacing={1}>
									<FSTextField label="Preview address" value={urlDraft} onChange={setUrlDraft} sx={{ flexGrow: 1 }} />
									<FSButton onClick={() => void open(urlDraft)} disabled={!urlDraft.trim()}>
										Open
									</FSButton>
								</FSStack>
							)}
						</FSStack>
					)}
				</FSBox>

				<FSStack spacing={2} sx={{ width: 340, flexShrink: 0, maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
					<FSStack direction="row" spacing={1} alignItems="center">
						<FSButton
							variant={mode === 'browse' ? 'primary' : 'secondary'}
							disabled={!opened || mode === 'composing'}
							onClick={() => (mode === 'picking' ? void cancel() : void startComment())}
						>
							{mode === 'picking' ? 'Click to place a pin…' : 'Place a pin (C)'}
						</FSButton>
						{mode !== 'browse' && (
							<FSButton variant="secondary" onClick={() => void cancel()}>
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
								<FSButton onClick={post} disabled={posting || !draft.trim()}>
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
			</FSStack>
		</FSStack>
	);
};
