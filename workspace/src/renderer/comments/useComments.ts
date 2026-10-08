import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CommentAnchor, MarkerResult, MarkerState, PinEvent, ReviewComment } from '../../shared/contract';
import { forgetPosted, markersFor, mergeComments, numberComments, openComments, sameComments } from '../../shared/comments';
import { latest } from '../../shared/latest';
import type { CommentStore, PageSurface } from './surfaces';

/** How often an open iteration looks for new comments. */
const REFRESH_MS = 60_000;

type Mode = 'browse' | 'picking' | 'composing';

/**
 * The comments on one iteration, and leaving one: everything about them except how they are drawn. Written against a
 * `CommentStore` and a `PageSurface`, so it runs wherever those can be given.
 *
 * `opened` says the page is up, which is when pins can be drawn and a click on it waited for. `route` is where the
 * page is, so the pins are drawn again when it moves. Errors go to `setError`, which the screen around this shows.
 */
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
	/** A pin was clicked: its comment is selected here, and the screen shows where it is. */
	onPinClick?: (id: number) => void;
}) => {
	const [comments, setComments] = useState<ReviewComment[] | null>(null);
	const [placed, setPlaced] = useState<Map<number, MarkerState>>(new Map());
	const [me, setMe] = useState<string | null>(null);
	const [selected, setSelected] = useState<number | null>(null);
	const [redraw, setRedraw] = useState(0);
	const cards = useRef(new Map<number, HTMLElement>());

	// Leaving a comment: comment mode, the pin being placed, and the box beside it.
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
	const pickActive = useRef(false);
	/** Set when the person backs out while a pick is still being read, so its result is dropped. */
	const pickCancelled = useRef(false);

	useEffect(() => {
		void store.viewer().then(setMe);
	}, [store]);

	// Comments posted or changed in this window. GitHub's listings can trail a new comment, so what was just posted is
	// kept here and merged into whatever is read back.
	const posted = useRef(new Map<number, ReviewComment>());

	/**
	 * Reading the comments. One read at a time, and never a lost one -- see `latest`. The bug it fixes was visible:
	 * opening an iteration reads on arrival and again once the preview is up, and while a request made during a read
	 * was simply dropped, the comments stayed as the first read left them until something else happened to ask.
	 * Posting a comment looked like what made an earlier one appear.
	 */
	/** True when someone asked for this read, so a failure is worth saying. Background reads are silent. */
	const asked = useRef(false);
	/**
	 * Counts the changes made from this window.
	 *
	 * GitHub answers a read as things stood *when the read began*. Resolve, move or delete something while one is in
	 * flight and that answer is already out of date when it lands: applying it puts the change back the way it was, and
	 * the comment reopens or the pin jumps back. So each change bumps this, and a read whose generation has moved on is
	 * dropped. The change stands, and the next read brings GitHub's own account of it.
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
		// Something was changed here while this was in flight, so this answer predates it.
		if (changes.current !== at) return;
		// A read that worked clears a complaint from one that did not.
		if (loud) setError(null);
		// A comment GitHub has returned no longer needs its local copy; keeping one would hold back a later change to it there.
		forgetPosted(posted.current, result.value);
		const next = mergeComments(result.value, posted.current.values());
		// Nothing new means nothing changes, so a refresh does not redraw every pin.
		setComments((prev) => (sameComments(prev, next) ? prev : next));
	}, [store, setError]);
	const runRead = useMemo(() => latest(read), [read]);
	/** Reads the comments again. `quiet` is for the background refresh: a failed check nobody asked for says nothing. */
	const load = useCallback(
		(quiet = false) => {
			if (!quiet) asked.current = true;
			return runRead();
		},
		[runRead],
	);

	useEffect(() => void load(), [load]);

	// A reviewer's comment made after this was opened should appear without anyone reopening it: when the window comes
	// back into focus, and about once a minute while it is in front.
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
	// What is still to be dealt with. Resolved comments stay listed, but are not the count.
	const total = openComments(comments ?? []).length;

	/**
	 * A comment as it now is, after this window changed it (posted, resolved, reopened, moved, addressed): shown at once,
	 * so its pin comes or goes without waiting for the next read, and kept until a read includes the change.
	 */
	const showChanged = useCallback((comment: ReviewComment) => {
		changes.current++;
		posted.current.set(comment.id, comment);
		setComments((cs) => {
			const all = cs ?? [];
			return all.some((c) => c.id === comment.id) ? all.map((c) => (c.id === comment.id ? comment : c)) : mergeComments(all, [comment]);
		});
	}, []);

	// Put the markers on the page. A function, not just an effect, because a screen that pictures the page (to draw
	// over it) must first make sure the picture includes them.
	const drawRun = useRef(0);
	const drawMarkers = useCallback(async () => {
		// Only your own pins can be dragged; GitHub would refuse anyone else's edit anyway.
		// The pin being placed shows at once, before it is saved (id -1, amber).
		const items = markersFor(comments ?? [], numbers, me, pending ? { anchor: pending, composing } : null);
		// Several of the things this depends on can change inside one round trip to the page, so an older draw must not
		// report its results over a newer one's: what is on the page would then be described by a list that is no longer
		// what was drawn.
		const mine = ++drawRun.current;
		const r = await page.showMarkers(items);
		if (mine !== drawRun.current) return;
		if (!r.ok) {
			// Said, not swallowed. The pins on the page are now whatever was there before, which may be a different set from
			// the comments listed beside them; silence would leave that looking deliberate.
			setPlaced(new Map());
			setError(r.error);
			return;
		}
		setPlaced(new Map(r.value.map((m: MarkerResult) => [m.id, m.state])));
	}, [comments, numbers, pending, composing, me, page, setError]);

	// ...and again whenever the comments, the page, or the route change.
	useEffect(() => {
		if (opened) void drawMarkers();
	}, [opened, drawMarkers, route, redraw]);

	// A pin on the page was clicked or dropped somewhere new. The screen's callback is held in a ref, since it is a new
	// function each render; everything else here changes only with the iteration, which listens afresh.
	const pinClick = useRef(onPinClick);
	pinClick.current = onPinClick;
	useEffect(
		() =>
			// Stopped on leaving: the handler for an iteration the person has left must not act on its comment ids.
			page.onPinEvent((e: PinEvent) => {
				if (e.kind === 'click') {
					if (e.id < 0) return;
					setSelected(e.id);
					pinClick.current?.(e.id);
					// The card may only now be drawn, in a sidebar that has just opened.
					setTimeout(() => cards.current.get(e.id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 250);
				} else if (e.id < 0) {
					// The unsaved pin: just remember where it now is.
					setPending((p) => (p ? { ...e.anchor, commit: p.commit } : p));
				} else {
					void store.move(e.id, e.anchor).then((r) => {
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

	/** Waits for one click on the page. */
	const pick = useCallback(async () => {
		// Only one at a time: React runs every effect twice in development, and a second pick would cancel the first,
		// which reads as someone pressing Escape.
		if (pickActive.current) return;
		pickActive.current = true;
		// A new pick: a backing-out meant for one before it is not this one's, or its first click would be dropped.
		pickCancelled.current = false;
		setError(null);
		setMode('picking');
		const r = await page.pick();
		pickActive.current = false;
		if (!r.ok) {
			setError(r.error);
			setMode('browse');
			setCommentMode(false);
		} else if (r.value) {
			const version = await store.version();
			// That takes a moment, and Escape may have landed in it. Backing out while this was in flight means there is
			// nothing to write on: setting the pin now would leave one on the page with no box, so the pick is dropped.
			if (pickCancelled.current) {
				pickCancelled.current = false;
				return;
			}
			setPending({ ...r.value.anchor, commit: version });
			setPendingAt(r.value.at);
			setPendingPicture(r.value.picture);
			setMode('composing');
		} else {
			// Cancelled: Escape on the page, or comment mode switched off.
			setMode('browse');
			setCommentMode(false);
		}
	}, [page, store, setError]);

	// Comment mode stays on: as soon as one comment is done, the next click is waited for.
	useEffect(() => {
		if (commentMode && opened && mode === 'browse') void pick();
	}, [commentMode, opened, mode, pick]);

	const exitCommentMode = useCallback(() => {
		setCommentMode(false);
		if (pickActive.current) {
			// Same reason as in cancelCompose: a pick still being read must not land a pin afterwards.
			pickCancelled.current = true;
			void page.cancelPick();
		}
	}, [page]);
	const toggleCommentMode = useCallback(() => (commentMode ? exitCommentMode() : setCommentMode(true)), [commentMode, exitCommentMode]);

	/** Abandons the comment being written, and the pin with it. Comment mode carries on. */
	const cancelCompose = useCallback(() => {
		if (pickActive.current) pickCancelled.current = true;
		setPending(null);
		setPendingPicture(null);
		setDraft('');
		setError(null);
		setMode('browse');
	}, [setError]);

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
			if (e.key.toLowerCase() === 'c') toggleCommentMode();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [opened, mode, commentMode, cancelCompose, exitCommentMode, toggleCommentMode]);

	/** Saves the comment being written. */
	const post = async () => {
		if (!draft.trim() || !pending) return;
		setPosting(true);
		const r = await store.post(draft.trim(), pending, pendingPicture);
		setPosting(false);
		if (r.ok) {
			showChanged(r.value);
			setDraft('');
			setPending(null);
			setPendingPicture(null);
			setMode('browse'); // comment mode is still on, so the next click is waited for
			await load();
		} else {
			setError(r.error);
		}
	};

	/** Deletes a comment for good. Says whether it went. */
	const remove = async (comment: ReviewComment): Promise<boolean> => {
		setError(null);
		const r = await store.remove(comment.id);
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
		const r = await store.resolve(comment.id, resolved);
		if (!r.ok) return setError(r.error);
		showChanged(r.value);
		// Same as deleting: the file the agent reads lists the open comments, and this is no longer one.
		void load(true);
	};

	/** A card was chosen: it is the selected one, and its pin is shown on the page. */
	const select = (comment: ReviewComment) => {
		setSelected(comment.id);
		if (comment.anchor) void page.focusMarker(comment.id);
	};
	/** Where each card is, so a clicked pin can bring its card into view. */
	const registerCard = (id: number, el: HTMLElement | null) => {
		if (el) cards.current.set(id, el);
		else cards.current.delete(id);
	};

	return {
		comments,
		numberOf,
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
		// Leaving one.
		commentMode,
		toggleCommentMode,
		composing,
		pendingAt,
		draft,
		setDraft,
		posting,
		post,
		cancelCompose,
	};
};

export type Comments = ReturnType<typeof useComments>;
