/** Values read from a file or the window, checked: each is what it should be, or nothing. Ids and slugs too. */

/** Whether a message read from elsewhere has these keys of its own and no others: what is read is exactly what was meant. */
export const hasExactly = (raw: object, keys: readonly string[]): boolean =>
	Object.keys(raw).length === keys.length && keys.every((k) => Object.hasOwn(raw, k));

/** The only shape a project id may take: lower-case words joined by single hyphens. */
export const PROJECT_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * A name becomes a project id. Truncation happens before the trailing hyphen is
 * stripped, so a long name cannot produce an id the core would reject.
 */
export const slugify = (name: string): string =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.slice(0, 60)
		.replace(/^-+|-+$/g, '');

/** A date from a record or from git, or null: anything that does not parse is not a date. */
export const asDate = (v: unknown): string | null => (typeof v === 'string' && v !== '' && !Number.isNaN(Date.parse(v)) ? v : null);

/**
 * Where in the running app a piece of work is, as a path (`/roles/compare`, `roles/compare?state=error`); null when the
 * record does not say. **It comes from a file an agent wrote, so it is checked, not trusted:** it is joined onto
 * `http://localhost:<port>`, so anything that could leave that origin (a scheme, a host, a backslash) is refused.
 */
export const asRoute = (v: unknown): string | null => {
	if (typeof v !== 'string') return null;
	const raw = v.trim();
	if (raw === '' || raw.length > 300) return null;
	// No scheme, no authority, no backslash, no control characters, no whitespace.
	if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
	if (raw.startsWith('//') || raw.includes('\\')) return null;
	if (/[\u0000- \u007f]/.test(raw)) return null;
	const path = raw.startsWith('/') ? raw : `/${raw}`;
	// `..` cannot escape the origin, but a route that climbs is a mistake in the record, not a landing place.
	if (path.split(/[/?#]/).includes('..')) return null;
	// A route pattern (`/organization/:id/roles`, `/org/{id}/roles`) as an address matches nothing, and the preview would
	// open on an error page that looks like the work failed. Refused, the work opens where the preview starts; the skill
	// says to record the form with no parameters in it.
	if (/\/:[^/]|[{}*]/.test(path)) return null;
	return path;
};

/** A picture's hash, as a record names it (`contentHashOf` of the page): twelve lower-case hex digits, nothing else. */
const COVER = /^[0-9a-f]{12}$/;

/** The hash a record gives a prototype's picture, or null when it gives none or anything else. */
export const asCover = (v: unknown): string | null => (typeof v === 'string' && COVER.test(v) ? v : null);

/** Refuses anything but a picture's hash: a path is built from it, and it comes from a record or the window. */
export const assertCover = (v: unknown): void => {
	if (asCover(v) === null) throw new Error('That is not the name of a picture.');
};
