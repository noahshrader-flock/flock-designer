import type { CommentAnchor, CommentRef, MarkerRequest, MarkerResult, PickedPoint, PinEvent, Result, ReviewComment } from '../../shared/contract';

/**
 * What the comments experience needs from where it runs, so none of it is written twice. Address and anything else that
 * runs an agent are not here: their result reaches the comments as a changed comment (`showChanged`).
 */

/** The comments on one version, and who is reading them. On the published page, GitHub's, through the relay. */
export interface CommentStore {
	read(): Promise<Result<ReviewComment[]>>;
	/** A comment, on a spot of the page (`anchor`) or on the page as a whole (`null`). */
	post(body: string, anchor: CommentAnchor | null, picture: string | null): Promise<Result<ReviewComment>>;
	resolve(comment: CommentRef, resolved: boolean): Promise<Result<ReviewComment>>;
	remove(comment: CommentRef): Promise<Result<null>>;
	/** A pin dragged somewhere new: the comment now points there. */
	move(comment: CommentRef, anchor: CommentAnchor): Promise<Result<ReviewComment>>;
	/** The viewer's GitHub login, or null when not signed in: only their own pins can be dragged. */
	viewer(): Promise<string | null>;
	/** On a prototype, the fingerprint of the page shown, written into a comment placed on it (`CommentAnchor.page`). */
	page?: string;
}

/** The page being commented on: the prototype's, framed on the published page. */
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
