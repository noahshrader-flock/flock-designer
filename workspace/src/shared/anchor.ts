import type { CommentAnchor } from './contract';

/**
 * Where a comment points, carried inside the comment itself.
 *
 * The comment is a GitHub issue comment, so the anchor rides in a hidden HTML
 * comment: invisible when someone reads the thread on GitHub, which instead
 * shows a plain "On /route · selector" line, and recoverable by the app. No
 * second store, no schema to migrate.
 */

const MARK = /<!--\s*fd-anchor:\s*(\{[\s\S]*?\})\s*-->/;
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
	return {
		route,
		selector,
		nearbyText: clip(r.nearbyText, 120),
		viewport: { width: int(viewport.width), height: int(viewport.height) },
		commit: /^[0-9a-f]{0,40}$/i.test(clip(r.commit, 40)) ? clip(r.commit, 40) : '',
		...(off ? { offset: { x: unit(off.x), y: unit(off.y) } } : {}),
	};
};

/** Comment text, then a readable line and the hidden anchor. */
export const composeBody = (text: string, anchor: CommentAnchor | null): string => {
	if (!anchor) return text;
	// `<` and `>` are escaped so the JSON can never close its own comment.
	const json = JSON.stringify(anchor).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
	const where = `_On \`${anchor.route}\` · \`${anchor.selector.replace(/`/g, "'")}\`_`;
	return `${text}\n\n${where}\n<!-- fd-anchor: ${json} -->`;
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
	MARK.test(body) ? body.replace(MARK, '').replace(/\n*_On `[^\n]*`_\s*$/, '').trim() : body;

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
