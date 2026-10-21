import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommentAnchor, MarkerResult, MarkerState, PinEvent, ReviewComment } from '../../shared/contract';
import { forgetPosted, markersFor, mergeComments, openComments, sameComments } from '../../shared/comments';
import { latest } from './latest';
import { REFRESH_MS, USE_EVENTS, dueForCheck } from './refresh';
import type { CommentStore, PageSurface } from './surfaces';

type Mode = 'browse' | 'picking' | 'composing';

// A pin dragged where the store knows no fingerprint keeps the one it had (`page`).
const stamped = (anchor: CommentAnchor, page: string | undefined): CommentAnchor => ({ ...anchor, ...(page ? { page } : {}) });

/** `opened` says the page is up, so pins can be drawn and a click waited for. */
export const useComments = ({
	store,
	page,
	opened,
	route,
	setError,
	onPinClick,
}: {
	store: CommentStore;
	page: PageSurface;
	opened: boolean;
	route: string | null;
	setError: (message: string | null) => void;
	onPinClick?: (id: number) => void;
}) => {
	const [comments, setComments] = useState<ReviewComment[] | null>(null);
	const [placed, setPlaced] = useState<Map<number, MarkerState>>(new Map());
	const [me, setMe] = useState<string | null>(null);
	const [selected, setSelected] = useState<number | null>(null);
	const [redraw, setRedraw] = useState(0);
	const cards = useRef(new Map<number, HTMLElement>());

	const [mode, setMode] = useState<Mode>('browse');
	// The draft pin and the box both hang off this one value.
	const composing = mode === 'composing';
	const [commentMode, setCommentMode] = useState(false);
	const [pending, setPending] = useState<CommentAnchor | null>(null);
	const [pendingAt, setPendingAt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
	const [pendingPicture, setPendingPicture] = useState<string | null>(null);
	const [draft, setDraft] = useState('');
	const [posting, setPosting] = useState(false);
	const [saying, setSaying] = useState(false);
	const pickActive = useRef(false);
	/** Set when the person backs out while a pick is still being read, so its result is dropped. */
	const pickCanceled = useRef(false);

	useEffect(() => {
		void store.viewer().then(setMe);
	}, [store]);

	// Comments posted or changed in this window. GitHub's listings can trail a new comment, so what was just posted is
	// kept here and merged into whatever is read back.
	const posted = useRef(new Map<number, ReviewComment>());

	// Never a lost read (`latest`), as opening a version reads on arrival and again once the preview is up.
	/** True when someone asked for this read, so a failure is worth saying. Background reads are silent. */
	const asked = useRef(false);
	/**
	 * GitHub answers a read as things stood when it began, so a read that lands after a change here would undo it (a
	 * comment reopens, a pin jumps back); such a read is dropped.
	 */
	const changes = useRef(0);
	const read = useCallback(async () => {
		const loud = asked.current;
		const at = changes.current;
		asked.current = false;
		const result = await store.read();
		if (!result.ok) {
			if (loud) setError(result.error);
			return;
		}
		if (changes.current !== at) return;
		if (loud) setError(null);
		// A comment GitHub has returned no longer needs its local copy; keeping one would hold back a later change to it there.
		forgetPosted(posted.current, result.value);
		const next = mergeComments(result.value, posted.current.values());
		// Nothing new means nothing changes, so a refresh does not redraw every pin.
		setComments((prev) => (sameComments(prev, next) ? prev : next));
	}, [store, setError]);
	const runRead = useMemo(() => latest(read), [read]);
	/** `quiet`: a failed check nobody asked for says nothing. */
	const load = useCallback(
		(quiet = false) => {
			if (!quiet) asked.current = true;
			return runRead();
		},
		[runRead],
	);

	useEffect(() => void load(), [load]);

	useEffect(() => {
		let lastActive = Date.now();
		let lastChecked = Date.now();
		const active = () => {
			lastActive = Date.now();
		};
		const check = () => {
			if (document.visibilityState !== 'visible') return;
			lastChecked = Date.now();
			void load(true);
		};
		const tick = () => {
			if (dueForCheck({ now: Date.now(), lastActive, lastChecked })) check();
		};
		const onFocus = () => {
			active();
			check();
		};
		const timer = setInterval(tick, REFRESH_MS);
		window.addEventListener('focus', onFocus);
		for (const e of USE_EVENTS) window.addEventListener(e, active, { passive: true });
		return () => {
			clearInterval(timer);
			window.removeEventListener('focus', onFocus);
			for (const e of USE_EVENTS) window.removeEventListener(e, active);
		};
	}, [load]);

	const total = openComments(comments ?? []).length;

	/** Shown at once, so its pin comes or goes without waiting for the next read, and kept until a read includes the change. */
	const showChanged = useCallback((comment: ReviewComment) => {
		changes.current++;
		posted.current.set(comment.id, comment);
		setComments((cs) => {
			const all = cs ?? [];
			return all.some((c) => c.id === comment.id) ? all.map((c) => (c.id === comment.id ? comment : c)) : mergeComments(all, [comment]);
		});
	}, []);

	const drawRun = useRef(0);
	const drawMarkers = useCallback(async () => {
		// Only your own pins can be dragged, as GitHub would refuse anyone else's edit. The pin being placed has id -1.
		const items = markersFor(comments ?? [], me, pending ? { anchor: pending, composing } : null);
		// Several of the things this depends on can change inside one round trip to the page, so an older draw must not
		// report its results over a newer one's.
		const mine = ++drawRun.current;
		const r = await page.showMarkers(items);
		if (mine !== drawRun.current) return;
		if (!r.ok) {
			// Said, not swallowed: the pins on the page may now differ from the comments listed, and silence would look deliberate.
			setPlaced(new Map());
			setError(r.error);
			return;
		}
		setPlaced(new Map(r.value.map((m: MarkerResult) => [m.id, m.state])));
	}, [comments, pending, composing, me, page, setError]);

	useEffect(() => {
		if (opened) void drawMarkers();
	}, [opened, drawMarkers, route, redraw]);

	// Held in a ref, since it is a new function each render; everything else here changes only with the version.
	const pinClick = useRef(onPinClick);
	pinClick.current = onPinClick;
	// For a dragged pin: its thread, which the host finds it by, is on the comment.
	const shown = useRef(comments);
	shown.current = comments;
	useEffect(
		() =>
			// Stopped on leaving: the handler for a version the person has left must not act on its comment ids.
			page.onPinEvent((e: PinEvent) => {
				// Only the new pin's place moves the box; a saved pin's is the page's own business.
				if (e.kind === 'at') {
					if (e.id < 0) setPendingAt(e.at);
					return;
				}
				if (e.kind === 'click') {
					if (e.id < 0) return;
					setSelected(e.id);
					pinClick.current?.(e.id);
					// The card may only now be drawn, in a sidebar that has just opened.
					setTimeout(() => cards.current.get(e.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 250);
				} else if (e.id < 0) {
					setPending((p) => (p ? stamped(e.anchor, store.page ?? p.page) : p));
				} else {
					const moved = shown.current?.find((c) => c.id === e.id);
					if (!moved) return setRedraw((n) => n + 1);
					void store.move(moved, stamped(e.anchor, store.page ?? moved.anchor?.page)).then((r) => {
						if (r.ok) {
							showChanged(r.value);
							// The comment now points somewhere else, and the file the agent reads says where.
							void load(true);
						} else {
							setError(r.error);
						}
						setRedraw((n) => n + 1); // either way, draw the pin from what is saved
					});
				}
			}),
		[page, store, showChanged, load, setError],
	);

	const pick = useCallback(async () => {
		// Only one at a time: React runs every effect twice in development, and a second pick would cancel the first,
		// which reads as someone pressing Escape.
		if (pickActive.current) return;
		pickActive.current = true;
		// A new pick: a backing-out meant for one before it is not this one's, or its first click would be dropped.
		pickCanceled.current = false;
		setError(null);
		setMode('picking');
		const r = await page.pick();
		pickActive.current = false;
		if (!r.ok) {
			setError(r.error);
			setMode('browse');
			setCommentMode(false);
		} else if (r.value) {
			// Backing out while the pick was in flight means there is nothing to write on: setting the pin now would leave
			// one on the page with no box, so the pick is dropped.
			if (pickCanceled.current) {
				pickCanceled.current = false;
				return;
			}
			setPending(stamped(r.value.anchor, store.page));
			setPendingAt(r.value.at);
			setPendingPicture(r.value.picture);
			setMode('composing');
		} else {
			setMode('browse');
			setCommentMode(false);
		}
	}, [page, store, setError]);

	useEffect(() => {
		if (commentMode && opened && mode === 'browse') void pick();
	}, [commentMode, opened, mode, pick]);

	const exitCommentMode = useCallback(() => {
		setCommentMode(false);
		if (pickActive.current) {
			// Same reason as in cancelCompose: a pick still being read must not land a pin afterwards.
			pickCanceled.current = true;
			void page.cancelPick();
		}
	}, [page]);
	const toggleCommentMode = useCallback(() => (commentMode ? exitCommentMode() : setCommentMode(true)), [commentMode, exitCommentMode]);

	/** Comment mode carries on. */
	const cancelCompose = useCallback(() => {
		if (pickActive.current) pickCanceled.current = true;
		setPending(null);
		setPendingPicture(null);
		setDraft('');
		setError(null);
		setMode('browse');
	}, [setError]);

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
			if (e.key.toLowerCase() === 'c') toggleCommentMode();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [opened, mode, commentMode, cancelCompose, exitCommentMode, toggleCommentMode]);

	/** When it did not go, why is the panel's error. */
	const send = async (body: string, anchor: CommentAnchor | null, picture: string | null): Promise<boolean> => {
		const r = await store.post(body, anchor, picture);
		if (!r.ok) setError(r.error);
		else showChanged(r.value);
		return r.ok;
	};

	const post = async () => {
		if (!draft.trim() || !pending) return;
		setPosting(true);
		const went = await send(draft.trim(), pending, pendingPicture);
		setPosting(false);
		if (!went) return;
		setDraft('');
		setPending(null);
		setPendingPicture(null);
		setMode('browse'); // comment mode is still on, so the next click is waited for
		await load();
	};

	const postGeneral = async (body: string): Promise<boolean> => {
		if (!body.trim() || saying) return false;
		setSaying(true);
		setError(null);
		const went = await send(body.trim(), null, null);
		setSaying(false);
		if (went) await load();
		return went;
	};

	const remove = async (comment: ReviewComment): Promise<boolean> => {
		setError(null);
		const r = await store.remove(comment);
		if (!r.ok) {
			setError(r.error);
			return false;
		}
		// Forgotten here too: comments just posted from this window are kept until a read includes them, and one that
		// stayed would come back on the next refresh.
		changes.current++;
		posted.current.delete(comment.id);
		setSelected((s) => (s === comment.id ? null : s));
		setComments((cs) => (cs ?? []).filter((c) => c.id !== comment.id));
		void load(true); // brings comments.md up to date too
		return true;
	};

	const resolve = async (comment: ReviewComment, resolved: boolean) => {
		setError(null);
		const r = await store.resolve(comment, resolved);
		if (!r.ok) return setError(r.error);
		showChanged(r.value);
		// Same as deleting: the file the agent reads lists the open comments, and this is no longer one.
		void load(true);
	};

	const select = (comment: ReviewComment) => {
		setSelected(comment.id);
		if (comment.anchor) void page.focusMarker(comment.id);
	};
	const registerCard = (id: number, el: HTMLElement | null) => {
		if (el) cards.current.set(id, el);
		else cards.current.delete(id);
	};

	return {
		comments,
		total,
		placed,
		selected,
		select,
		registerCard,
		load,
		showChanged,
		resolve,
		remove,
		drawMarkers,
		commentMode,
		toggleCommentMode,
		composing,
		pendingAt,
		draft,
		setDraft,
		posting,
		post,
		postGeneral,
		saying,
		cancelCompose,
	};
};

export type Comments = ReturnType<typeof useComments>;
