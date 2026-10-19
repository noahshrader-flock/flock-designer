/** Review comments and where they are pinned on a page, and the page's own messages about them. */

/**
 * A comment as the host finds one: the review thread it is in (its issue), and its own number. What the window sends
 * back to act on a comment, and what every comment is.
 */
export interface CommentRef {
	thread: number;
	id: number;
}

/** One reviewer comment, stored as a GitHub issue comment, in the thread it was read from. */
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
	/** On a prototype, the version that change is in: a new one from this, when others had commented on this one. */
	addressedIn: string | null;
	/** Where on the page it was placed; null for a comment on the page as a whole. */
	anchor: CommentAnchor | null;
	/** A small picture of the spot, as a JPEG data URL, taken when the comment was placed. Null when it has none. */
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
	/** Where in the element the click landed, 0 to 1 each way, so a marker sits where the comment was made. */
	offset?: { x: number; y: number };
	/** The kind of element it is (`p`, `button`), so "this subtext" and "this button" are told apart in words. */
	tag?: string;
	/**
	 * The named containers it sits inside, outermost first, at most three: "Notification Preferences",
	 * "Hotlist Hits". Text a person or an agent can search for, which a path of nth-of-type cannot be.
	 */
	inside?: string[];
	/**
	 * The page's query string when the comment was made (`?state=error`), which is what tells one state of a
	 * prototype from another. Empty for the default state. Absent on comments that do not record it,
	 * which are shown wherever their element is.
	 */
	state?: string;
	/**
	 * The theme the page was seen in when the comment was made, so it can be opened in it again.
	 * Absent on comments that do not record it.
	 */
	theme?: 'light' | 'dark';
	/**
	 * On a prototype, the page it was placed on, as its fingerprint (the short hash a page's picture is named by too), so a
	 * comment can say when the page has changed since. Absent on comments that do not record it, which say nothing.
	 */
	page?: string;
}

/** A comment to place on the page, numbered as it is listed beside it. */
export interface MarkerRequest {
	id: number;
	/** Whose pin it is, by name, and their picture (the host's) or none: the pin shows the picture, or their first letter. */
	author: string;
	avatarUrl: string | null;
	anchor: CommentAnchor;
	/** True for the viewer's own pins, which can be dragged. */
	movable?: boolean;
}

/** What a pin on the page reports: it was clicked, or it was dragged and dropped. */
export type PinEvent = { kind: 'click'; id: number } | { kind: 'move'; id: number; anchor: CommentAnchor };

/** How a comment was placed on the page. `moved` follows the text; `missing` degrades to a page-level comment. */
export type MarkerState = 'found' | 'moved' | 'missing' | 'elsewhere' | 'otherState';

export interface MarkerResult {
	id: number;
	state: MarkerState;
}

/** Where a click landed: the anchor to store, and the point in the page, which is only for placing the comment box. */
export interface PickedPoint {
	anchor: CommentAnchor;
	at: { x: number; y: number };
	/** The element's own box in the page, so the picture can frame the element. Absent if it could not be measured. */
	box: { x: number; y: number; width: number; height: number } | null;
	/** The spot cropped from the page before any pin was drawn, if it could be taken. */
	picture: string | null;
}
