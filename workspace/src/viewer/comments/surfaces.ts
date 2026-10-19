import type { CommentAnchor, CommentRef, MarkerRequest, MarkerResult, PickedPoint, PinEvent, Result, ReviewComment } from '../../shared/contract';

// Anything that runs an agent is not here: its result reaches the comments as a changed comment (`showChanged`).

export interface CommentStore {
	read(): Promise<Result<ReviewComment[]>>;
	/** `anchor` null is a comment on the page as a whole. */
	post(body: string, anchor: CommentAnchor | null, picture: string | null): Promise<Result<ReviewComment>>;
	resolve(comment: CommentRef, resolved: boolean): Promise<Result<ReviewComment>>;
	remove(comment: CommentRef): Promise<Result<null>>;
	move(comment: CommentRef, anchor: CommentAnchor): Promise<Result<ReviewComment>>;
	/** The viewer's GitHub login, or null when not signed in. */
	viewer(): Promise<string | null>;
	/** On a prototype, the fingerprint of the page shown (`CommentAnchor.page`). */
	page?: string;
}

export interface PageSurface {
	/** Null when it was canceled. */
	pick(): Promise<Result<PickedPoint | null>>;
	cancelPick(): Promise<unknown>;
	showMarkers(items: MarkerRequest[]): Promise<Result<MarkerResult[]>>;
	focusMarker(id: number): Promise<unknown>;
	onPinEvent(listener: (e: PinEvent) => void): () => void;
}
