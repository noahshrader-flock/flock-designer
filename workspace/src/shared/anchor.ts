import type { CommentAnchor } from './contract';
import { isPrototypeName } from './projects';
import { COMMIT_PATTERN, isCommit } from './sha';

/**
 * Where a comment points, carried inside the comment itself.
 *
 * The comment is a GitHub issue comment, so the anchor rides in a hidden HTML
 * comment: invisible when someone reads the thread on GitHub, which instead
 * shows a plain "On /route · selector" line, and recoverable by the app. No
 * second store, no schema to migrate.
 */

const MARK = /<!--\s*fd-anchor:\s*(\{[\s\S]*?\})\s*-->/;
const PICTURE_MARK = /<!--\s*fd-picture:\s*(\S+)\s*-->/;
/** A small JPEG as a data URL. The size cap is generous for what is made (about 12 KB), and bounds what a hand-written comment can carry. */
const PICTURE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]{1,24000}={0,2}$/;

/** A picture from anywhere that did not come from this code, or null. Only a small JPEG data URL passes. */
export const sanitizePicture = (v: unknown): string | null => (typeof v === 'string' && PICTURE.test(v) ? v : null);
const clip = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const int = (v: unknown): number => (Number.isFinite(v) ? Math.max(0, Math.min(100_000, Math.round(v as number))) : 0);
const unit = (v: unknown): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v as number)) : 0);

/**
 * Validates an anchor from anywhere it did not come from this code: a preview
 * page's reply, or a comment someone else wrote. Lengths are capped and shapes
 * forced, so a page cannot smuggle an arbitrary payload into a shared repo.
 */
export const sanitizeAnchor = (v: unknown): CommentAnchor | null => {
	if (typeof v !== 'object' || v === null) return null;
	const r = v as Record<string, unknown>;
	const route = clip(r.route, 300);
	const selector = clip(r.selector, 500);
	if (!route.startsWith('/') || selector === '') return null;
	const viewport = (r.viewport ?? {}) as Record<string, unknown>;
	const off = r.offset as Record<string, unknown> | undefined;
	// A query string, or empty. Anything else (a script, markup, a very long value) is not a state, so it is dropped.
	const state = typeof r.state === 'string' && /^(\?[^\s<>`"']{0,199})?$/.test(r.state) ? r.state : undefined;
	// Words describing where the element is, from a page, so capped and cleaned: no control characters, no markup.
	const words = (x: unknown, max: number): string =>
		typeof x === 'string'
			? x
					.replace(/[\u0000-\u001f<>`]/g, ' ')
					.replace(/\s+/g, ' ')
					.trim()
					.slice(0, max)
			: '';
	const tag = /^[a-z][a-z0-9-]{0,30}$/.test(typeof r.tag === 'string' ? r.tag : '') ? (r.tag as string) : undefined;
	const inside = (Array.isArray(r.inside) ? r.inside : [])
		.map((x) => words(x, 60))
		.filter(Boolean)
		.slice(0, 3);
	return {
		route,
		selector,
		nearbyText: clip(r.nearbyText, 120),
		viewport: { width: int(viewport.width), height: int(viewport.height) },
		commit: isCommit(r.commit) ? r.commit : '',
		...(off ? { offset: { x: unit(off.x), y: unit(off.y) } } : {}),
		...(state !== undefined ? { state } : {}),
		...(tag !== undefined ? { tag } : {}),
		...(inside.length > 0 ? { inside } : {}),
	};
};

/** Comment text, then a readable line, the hidden anchor and, if there is one, the hidden picture. */
export const composeBody = (text: string, anchor: CommentAnchor | null, picture: string | null = null): string => {
	if (!anchor) return text;
	// `<` and `>` are escaped so the JSON can never close its own comment.
	const json = JSON.stringify(anchor).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
	const where = `_On \`${anchor.route}${anchor.state ?? ''}\` · \`${anchor.selector.replace(/`/g, "'")}\`_`;
	const pic = sanitizePicture(picture);
	return `${text}\n\n${where}\n<!-- fd-anchor: ${json} -->${pic ? `\n<!-- fd-picture: ${pic} -->` : ''}`;
};

export const parsePicture = (body: string): string | null => sanitizePicture(PICTURE_MARK.exec(body)?.[1]);

/** Marks the body of a resolved comment. Simple, and visible to someone reading on GitHub. */
export const RESOLVED_MARK = '<!-- resolved -->';

export const isResolved = (body: string): boolean => body.includes(RESOLVED_MARK);

/** The body with the resolved marker set or cleared, and nothing else touched. */
export const withResolved = (body: string, resolved: boolean): string => {
	const bare = body.replace(RESOLVED_MARK, '').trimEnd();
	return resolved ? `${bare}\n${RESOLVED_MARK}` : bare;
};

/**
 * Marks a comment the agent has acted on, with the commit it made. The app resolves the comment with it (see
 * `setAddressed`), so its pin leaves the page; the mark is what is left to say what was done, and where.
 *
 * Before 2026-10-08 the two were kept apart, so a comment could be addressed and still open, waiting for the person's
 * verdict. Those still read correctly: an addressed comment that is open is shown as it was.
 *
 * Kept in the body like the resolved mark, so it survives the app restarting and is visible to
 * anyone else reading the thread on GitHub. On a prototype it also says which iteration the change is in, since one
 * that others had commented on is never changed in place: the change is in its next iteration.
 */
const ADDRESSED = new RegExp(`<!-- fd-addressed: (${COMMIT_PATTERN})(?: in ([\\w-]{1,20}))? -->`);

export const addressedAt = (body: string): string | null => ADDRESSED.exec(body)?.[1] ?? null;
/** The prototype iteration the change was made in, when the mark names one. */
export const addressedIn = (body: string): string | null => {
	const name = ADDRESSED.exec(body)?.[2] ?? null;
	return name !== null && isPrototypeName(name) ? name : null;
};

/** The body marked as addressed at `commit` (in a prototype's `iteration`), or with the mark cleared when it is null. */
export const withAddressed = (body: string, commit: string | null, iteration: string | null = null): string => {
	const bare = body.replace(ADDRESSED, '').trimEnd();
	// Only ever a real commit, and a real iteration name: these are read back out and shown on the card.
	if (!isCommit(commit)) return bare;
	return `${bare}\n<!-- fd-addressed: ${commit}${iteration !== null && isPrototypeName(iteration) ? ` in ${iteration}` : ''} -->`;
};

export const parseAnchor = (body: string): CommentAnchor | null => {
	const m = MARK.exec(body);
	if (!m?.[1]) return null;
	try {
		return sanitizeAnchor(JSON.parse(m[1]));
	} catch {
		return null;
	}
};

/** The comment as a person wrote it: without the anchor, and without the "On /route" line that goes with it. */
export const stripAnchor = (body: string): string =>
	MARK.test(body)
		? body
				.replace(PICTURE_MARK, '')
				.replace(ADDRESSED, '')
				.replace(MARK, '')
				.replace(/\n*_On `[^\n]*`_\s*$/, '')
				.trim()
		: body.replace(ADDRESSED, '').trimEnd();

/**
 * Only addresses a preview can legitimately have. A local dev server is http on
 * this machine; a shared preview is https. Anything else -- file:, javascript:,
 * an address with a password in it -- is refused before a view is ever created.
 */
export const assertPreviewUrl = (raw: string): string => {
	let url: URL;
	try {
		url = new URL(raw.trim());
	} catch {
		throw new Error(`"${raw}" is not a web address.`);
	}
	const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
	if (url.username || url.password) throw new Error('A preview address cannot contain a username or password.');
	if (url.protocol === 'https:' || (url.protocol === 'http:' && local)) return url.href;
	throw new Error(
		url.protocol === 'http:'
			? 'Only a preview on this machine can use http. A shared preview must be https.'
			: `A preview must be a web address, not ${url.protocol}`,
	);
};
