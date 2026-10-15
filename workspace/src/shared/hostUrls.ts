/**
 * The host's web addresses, built and recognised in one place: what a person opens in a browser (a branch, a comparison,
 * an avatar) and what a record keeps (a change request's address). Every part a person or a branch names is encoded the
 * same way: each segment on its own, so a slash in a branch stays a slash and anything else is escaped.
 */

const WEB = 'https://github.com';
/** Where the host serves people's avatars. The window's own page allows it by name (`renderer/index.html`'s CSP). */
export const AVATAR_ORIGIN = 'https://avatars.githubusercontent.com';
/** Where the host's command line is installed from. */
export const CLI_INSTALL_URL = 'https://cli.github.com';
/** Where a person is sent to sign in to a GitHub App from a web page (the authorization-code flow, with PKCE). */
export const SIGN_IN_AUTHORIZE_URL = `${WEB}/login/oauth/authorize`;

/** Where a repository's Pages site is: `<owner>.github.io/<repo>/`, its owner as a host name is, in lower case. */
export const pagesSiteUrl = ({ owner, repo }: { owner: string; repo: string }): string =>
	`https://${owner.toLowerCase()}.github.io/${encodeURIComponent(repo)}/`;

/** A path or a branch, each of its segments encoded. */
const segments = (path: string): string => path.split('/').map(encodeURIComponent).join('/');

/** A branch of `repo` (`owner/repo`), or a folder on it. */
export const treeUrl = (repo: string, branch: string, path?: string): string =>
	`${WEB}/${repo}/tree/${segments(branch)}${path ? `/${segments(path)}` : ''}`;

/** What `head` changes against `base`, ready to open a change request from. */
export const compareUrl = (repo: string, base: string, head: string): string =>
	`${WEB}/${repo}/compare/${segments(base)}...${segments(head)}?expand=1`;

/** Where `repo` is cloned from. */
export const cloneUrl = (repo: string): string => `${WEB}/${repo}.git`;

/** A change request's address: a pull request on the host, and nowhere else. */
const CHANGE_REQUEST_URL = new RegExp(`^${WEB.replace(/[.]/g, '\\.')}/[\\w.-]+/[\\w.-]+/pull/\\d+$`);

/** A change request's address as a record gives it, or null when it is not one of the host's. */
export const asChangeRequestUrl = (v: unknown): string | null => (typeof v === 'string' && CHANGE_REQUEST_URL.test(v) ? v : null);

/** A person's avatar, which the host serves for any login. Null when only a git name is known. */
export const avatarUrl = (login: string | null): string | null => (login ? `${AVATAR_ORIGIN}/${encodeURIComponent(login)}?size=64` : null);

/** The login in the host's private email for a person, `12345+login@users.noreply.github.com` or `login@…`; null for any other. */
export const loginFromNoreply = (email: string): string | null =>
	/^(?:\d+\+)?([A-Za-z0-9-]+)@users\.noreply\.github\.com$/i.exec(email.trim())?.[1] ?? null;
