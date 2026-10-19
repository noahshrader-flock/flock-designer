/** Each segment of a name is encoded on its own, so a slash in a branch stays a slash and anything else is escaped. */

const WEB = 'https://github.com';
/** The only place a page's pin loads a picture from (`isAvatarUrl`). */
export const AVATAR_ORIGIN = 'https://avatars.githubusercontent.com';
export const CLI_INSTALL_URL = 'https://cli.github.com';
/** The authorization-code flow, with PKCE. */
export const SIGN_IN_AUTHORIZE_URL = `${WEB}/login/oauth/authorize`;

/** The folder the host reads a repository's own files from: its workflows, which run with the repository's permissions, and templates. */
export const HOST_DIR = '.github/';
/** As the host reads them: one found is used; none, or several, none is. */
export const CHANGE_REQUEST_TEMPLATES = [HOST_DIR, '', 'docs/'].flatMap((folder) =>
	['pull_request_template.md', 'PULL_REQUEST_TEMPLATE.md'].map((name) => `${folder}${name}`),
);

export const pagesSiteUrl = ({ owner, repo }: { owner: string; repo: string }): string =>
	`https://${owner.toLowerCase()}.github.io/${encodeURIComponent(repo)}/`;

const segments = (path: string): string => path.split('/').map(encodeURIComponent).join('/');

/** `repo` is `owner/repo`. */
export const treeUrl = (repo: string, branch: string, path?: string): string =>
	`${WEB}/${repo}/tree/${segments(branch)}${path ? `/${segments(path)}` : ''}`;

export const compareUrl = (repo: string, base: string, head: string): string =>
	`${WEB}/${repo}/compare/${segments(base)}...${segments(head)}?expand=1`;

export const cloneUrl = (repo: string): string => `${WEB}/${repo}.git`;

const CHANGE_REQUEST_URL = new RegExp(`^${WEB.replace(/[.]/g, '\\.')}/[\\w.-]+/[\\w.-]+/pull/\\d+$`);

export const asChangeRequestUrl = (v: unknown): string | null => (typeof v === 'string' && CHANGE_REQUEST_URL.test(v) ? v : null);

export const avatarUrl = (login: string | null): string | null => (login ? `${AVATAR_ORIGIN}/${encodeURIComponent(login)}?size=64` : null);

/** From `12345+login@users.noreply.github.com` or `login@…`; null for any other email. */
export const loginFromNoreply = (email: string): string | null =>
	/^(?:\d+\+)?([A-Za-z0-9-]+)@users\.noreply\.github\.com$/i.exec(email.trim())?.[1] ?? null;
