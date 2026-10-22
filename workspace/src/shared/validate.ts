export const hasExactly = (raw: object, keys: readonly string[]): boolean =>
	Object.keys(raw).length === keys.length && keys.every((k) => Object.hasOwn(raw, k));

export const PROTOTYPE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Cut short before the trailing hyphen is stripped, so a long name cannot produce an id the core would reject. */
export const slugify = (name: string): string =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, 60)
		.replace(/^-+|-+$/g, '');

export const asDate = (v: unknown): string | null => (typeof v === 'string' && v !== '' && !Number.isNaN(Date.parse(v)) ? v : null);

/**
 * It comes from a file an agent wrote and is joined onto `http://localhost:<port>`, so anything that could leave that
 * origin (a scheme, a host, a backslash) is refused.
 */
export const asRoute = (v: unknown): string | null => {
	if (typeof v !== 'string') return null;
	const raw = v.trim();
	if (raw === '' || raw.length > 300) return null;
	if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
	if (raw.startsWith('//') || raw.includes('\\')) return null;
	if (/[\u0000- \u007f]/.test(raw)) return null;
	const path = raw.startsWith('/') ? raw : `/${raw}`;
	// `..` cannot escape the origin, but a route that climbs is a mistake in the record, not a landing place.
	if (path.split(/[/?#]/).includes('..')) return null;
	// A route pattern (`/org/:id/roles`) matches nothing, and the preview would open on an error page that looks like the
	// work failed; refused, the work opens where the preview starts.
	if (/\/:[^/]|[{}*]/.test(path)) return null;
	return path;
};

const COVER = /^[0-9a-f]{12}$/;

export const asCover = (v: unknown): string | null => (typeof v === 'string' && COVER.test(v) ? v : null);

/** A path is built from it, and it comes from a record or the window. */
export const assertCover = (v: unknown): void => {
	if (asCover(v) === null) throw new Error('That is not the name of a picture.');
};
