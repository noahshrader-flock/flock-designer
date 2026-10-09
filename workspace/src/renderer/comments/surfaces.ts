import type { CommentAnchor, MarkerRequest, MarkerResult, PickedPoint, PinEvent, Result, ReviewComment } from '../../shared/contract';

/**
 * What the comments experience needs from where it runs, in two parts, so it can run in the app today and on a
 * prototype's own page later with nothing of it written twice.
 *
 * Address, Hand off and anything else that runs an agent are not here: they stay the app's. Their result reaches the
 * comments as a changed comment (`showChanged`), as any other change does.
 */

/** The comments on one iteration, and who is reading them. The app's are GitHub's, through its main process. */
export interface CommentStore {
	read(): Promise<Result<ReviewComment[]>>;
	post(body: string, anchor: CommentAnchor, picture: string | null): Promise<Result<ReviewComment>>;
	resolve(id: number, resolved: boolean): Promise<Result<ReviewComment>>;
	remove(id: number): Promise<Result<null>>;
	/** A pin dragged somewhere new: the comment now points there. */
	move(id: number, anchor: CommentAnchor): Promise<Result<ReviewComment>>;
	/** The viewer's GitHub login, or null when not signed in: only their own pins can be dragged. */
	viewer(): Promise<string | null>;
	/** What the work is at now, written into a new comment so it says what it was made against; '' when not known. */
	version(): Promise<string>;
}

/** The page being commented on. The app's is its native preview. */
export interface PageSurface {
	/** Waits for one click on the page: where it landed, or null when it was canceled. */
	pick(): Promise<Result<PickedPoint | null>>;
	cancelPick(): Promise<unknown>;
	/** Draws the pins, and says how each was placed. */
	showMarkers(items: MarkerRequest[]): Promise<Result<MarkerResult[]>>;
	focusMarker(id: number): Promise<unknown>;
	/** A pin was clicked, or dragged somewhere new. Returns a way to stop listening. */
	onPinEvent(listener: (e: PinEvent) => void): () => void;
}
