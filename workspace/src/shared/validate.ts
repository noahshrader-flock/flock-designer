/** Values read from a file or the window, checked: each is what it should be, or nothing. Ids and slugs too. */

/** The only shape a project id may take: lower-case words joined by single hyphens. */
export const PROJECT_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * A name becomes a project id. Truncation happens before the trailing hyphen is
 * stripped, so a long name cannot produce an id the main process would reject.
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
 * Where in the running app an iteration's work actually is, as a path within it -- `/roles/compare`,
 * or `roles/compare?state=error`. Null when the record does not say, and the preview opens at the
 * app's own front door as before.
 *
 * **This comes out of a file an agent wrote, so it is checked, not trusted.** It is joined onto
 * `http://localhost:<port>` to make the address the preview loads, so anything that could leave that
 * origin is refused rather than corrected: a scheme (`javascript:`, `http:`), a host (`//evil.test`),
 * or a backslash, which some parsers read as a slash. What is left is a path on the preview itself.
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
	// A route pattern is not a route. `/organization/:id/roles` and `/org/{id}/roles` are what a router
	// matches against; as an address they are taken literally and match nothing, so the preview would
	// open on an error page that looks like the work failed. Refusing it here means the iteration opens
	// where it always did instead, and the skill says to record the form with no parameters in it.
	if (/\/:[^/]|[{}*]/.test(path)) return null;
	return path;
};

/** A repository on GitHub, by its `owner/repo`: GitHub's own characters, and never `.` or `..`. */
const isGitHubRepository = (s: unknown): s is string =>
	typeof s === 'string' && /^[\w.-]+\/[\w.-]+$/.test(s) && !s.split('/').some((p) => p === '.' || p === '..');

const PULL_REQUEST = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/;

/** A repository as a record gives it, or null when it is anything else. */
export const asGitHubRepository = (v: unknown): string | null => (isGitHubRepository(v) ? v : null);

/** A pull request's address as a record gives it, or null when it is not one of GitHub's. */
export const asPullRequest = (v: unknown): string | null => (typeof v === 'string' && PULL_REQUEST.test(v) ? v : null);

/**
 * One plain file or folder name, never a path. Project ids and record names reach the main process from the window and
 * are joined onto a folder or a repository address, so they are checked before they are used for either.
 */
export const isRecordName = (n: unknown): n is string => typeof n === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(n) && !n.includes('..');

/** A picture's hash, as a record names it (`prototypeVersionOf` of the page): twelve lower-case hex digits, nothing else. */
const COVER = /^[0-9a-f]{12}$/;

/** The hash a record gives a prototype's picture, or null when it gives none or anything else. */
export const asCover = (v: unknown): string | null => (typeof v === 'string' && COVER.test(v) ? v : null);

/** Refuses anything but a picture's hash: a path is built from it, and it comes from a record or the window. */
export const assertCover = (v: unknown): void => {
	if (asCover(v) === null) throw new Error('That is not the name of a picture.');
};
