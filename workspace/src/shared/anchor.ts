import type { CommentAnchor } from './contract';
import { isPrototypeName } from './prototypeNames';
import { isTheme } from './prototypeTheme';
import { COMMIT_PATTERN, isCommit } from './sha';

/** The anchor rides in a hidden HTML comment inside the GitHub comment itself: no second store, no schema to migrate. */

const MARK = /<!--\s*fd-anchor:\s*(\{[\s\S]*?\})\s*-->/;
const PICTURE_MARK = /<!--\s*fd-picture:\s*(\S+)\s*-->/;
const PAGE = /^[0-9a-f]{12}$/;
/** The cap is generous for what is made (about 12 KB), and bounds what a hand-written comment can carry. */
const PICTURE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]{1,24000}={0,2}$/;

export const sanitizePicture = (v: unknown): string | null => (typeof v === 'string' && PICTURE.test(v) ? v : null);
const clip = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const int = (v: unknown): number => (Number.isFinite(v) ? Math.max(0, Math.min(100_000, Math.round(v as number))) : 0);
const unit = (v: unknown): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v as number)) : 0);

/** Lengths are capped and shapes forced, so a page or a hand-written comment cannot smuggle a payload into a shared repo. */
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
		...(isTheme(r.theme) ? { theme: r.theme } : {}),
		...(tag !== undefined ? { tag } : {}),
		...(inside.length > 0 ? { inside } : {}),
		...(typeof r.page === 'string' && PAGE.test(r.page) ? { page: r.page } : {}),
	};
};

export const composeBody = (text: string, anchor: CommentAnchor | null, picture: string | null = null): string => {
	if (!anchor) return text;
	// `<` and `>` are escaped so the JSON can never close its own comment.
	const json = JSON.stringify(anchor).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
	const where = `_On \`${anchor.route}${anchor.state ?? ''}\` · \`${anchor.selector.replace(/`/g, "'")}\`_`;
	const pic = sanitizePicture(picture);
	return `${text}\n\n${where}\n<!-- fd-anchor: ${json} -->${pic ? `\n<!-- fd-picture: ${pic} -->` : ''}`;
};

export const parsePicture = (body: string): string | null => sanitizePicture(PICTURE_MARK.exec(body)?.[1]);

export const RESOLVED_MARK = '<!-- resolved -->';

export const isResolved = (body: string): boolean => body.includes(RESOLVED_MARK);

export const withResolved = (body: string, resolved: boolean): string => {
	const bare = body.replace(RESOLVED_MARK, '').trimEnd();
	return resolved ? `${bare}\n${RESOLVED_MARK}` : bare;
};

/**
 * The comment is resolved with it too, so this mark is what says what was done and where. On a prototype it names the
 * version the change is in, which may not be the one commented on.
 */
const ADDRESSED = new RegExp(`<!-- fd-addressed: (${COMMIT_PATTERN})(?: in ([\\w-]{1,20}))? -->`);

export const addressedAt = (body: string): string | null => ADDRESSED.exec(body)?.[1] ?? null;
export const addressedIn = (body: string): string | null => {
	const name = ADDRESSED.exec(body)?.[2] ?? null;
	return name !== null && isPrototypeName(name) ? name : null;
};

/** A null `commit` clears the mark. */
export const withAddressed = (body: string, commit: string | null, version: string | null = null): string => {
	const bare = body.replace(ADDRESSED, '').trimEnd();
	// Only ever a real commit, and a real version's name: these are read back out and shown on the card.
	if (!isCommit(commit)) return bare;
	return `${bare}\n<!-- fd-addressed: ${commit}${version !== null && isPrototypeName(version) ? ` in ${version}` : ''} -->`;
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

/** Also drops the "On /route" line that goes with the anchor. */
export const stripAnchor = (body: string): string =>
	MARK.test(body)
		? body
				.replace(PICTURE_MARK, '')
				.replace(ADDRESSED, '')
				.replace(MARK, '')
				.replace(/\n*_On `[^\n]*`_\s*$/, '')
				.trim()
		: body.replace(ADDRESSED, '').trimEnd();
