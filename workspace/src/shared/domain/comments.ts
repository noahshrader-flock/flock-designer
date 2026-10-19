/** `thread` is the review thread's issue number. */
export interface CommentRef {
	thread: number;
	id: number;
}

export interface ReviewComment extends CommentRef {
	author: string;
	authorAvatarUrl: string | null;
	body: string;
	createdAt: string;
	resolved: boolean;
	/**
	 * The commit the agent made when it acted on this comment, or null. Acting on it resolves it too, but the two are kept
	 * apart: a person can open it again, and the mark stays.
	 */
	addressedAt: string | null;
	/** On a prototype, the version that change is in: a new one, when others had commented on this one. */
	addressedIn: string | null;
	/** Null for a comment on the page as a whole. */
	anchor: CommentAnchor | null;
	/** A JPEG data URL of the spot, taken when the comment was placed. */
	picture: string | null;
}

/**
 * Where a comment points, as several independent clues on purpose: a selector alone breaks the moment the markup changes,
 * and a comment that cannot be placed must degrade to a page-level comment rather than vanish.
 */
export interface CommentAnchor {
	route: string;
	selector: string;
	nearbyText: string;
	viewport: { width: number; height: number };
	commit: string;
	/** 0 to 1 each way within the element. */
	offset?: { x: number; y: number };
	/** So "this subtext" and "this button" are told apart in words. */
	tag?: string;
	/** Named containers, outermost first, at most three: text a person or an agent can search for, as nth-of-type is not. */
	inside?: string[];
	/**
	 * The page's query string when the comment was made (`?state=error`); empty for the default state. Absent on older
	 * comments, which are shown wherever their element is.
	 */
	state?: string;
	theme?: 'light' | 'dark';
	/** On a prototype, the page's short hash, so a comment can say when the page has changed since. */
	page?: string;
}

export interface MarkerRequest {
	id: number;
	author: string;
	avatarUrl: string | null;
	anchor: CommentAnchor;
	movable?: boolean;
}

export type PinEvent = { kind: 'click'; id: number } | { kind: 'move'; id: number; anchor: CommentAnchor };

/** `moved` follows the text; `missing` degrades to a page-level comment. */
export type MarkerState = 'found' | 'moved' | 'missing' | 'elsewhere' | 'otherState';

export interface MarkerResult {
	id: number;
	state: MarkerState;
}

/** `at` is only for placing the comment box. */
export interface PickedPoint {
	anchor: CommentAnchor;
	at: { x: number; y: number };
	box: { x: number; y: number; width: number; height: number } | null;
	/** Cropped before any pin was drawn. */
	picture: string | null;
}
