/**
 * What went wrong with the host, said one way, whichever way it was asked: the app's session, the person's command line
 * (`gh api`), or the published page's own calls. Each raises a `HostError`, and a caller tests its
 * `kind`, never a status, a class or the words of a message, so a second host only has to say which kind it was.
 */

export type HostErrorKind =
	/** Not there: a file, a comment, a page, or a repository the app cannot see. */
	| 'notFound'
	/** There, but not this person's (or this app's) to read or change. */
	| 'forbidden'
	/** Changed since it was read: what was written against is no longer what is there. */
	| 'conflict'
	/** The sign-in is spent: sign in again. */
	| 'reauth'
	/** The host did not answer, or answered that it could not. */
	| 'unreachable'
	/** The person's command line for the host is not on this machine. */
	| 'missingCli'
	/** The host's limit on how often it may be asked is reached: it says when to ask again. */
	| 'rateLimited'
	/** Anything else: the message says what. */
	| 'failed';

/**
 * The kind a status says, as GitHub uses them. A 422 is a lost race to GitHub (a file written without the sha it now
 * has); another host may say that differently, and is then the one to say so.
 */
export const kindOfStatus = (status: number | undefined): HostErrorKind => {
	if (status === 404) return 'notFound';
	if (status === 403) return 'forbidden';
	if (status === 401) return 'reauth';
	if (status === 409 || status === 422) return 'conflict';
	if (status !== undefined && status >= 500) return 'unreachable';
	return 'failed';
};

export class HostError extends Error {
	constructor(
		message: string,
		/** The host's status, when it gave one. */
		readonly status?: number,
		readonly kind: HostErrorKind = kindOfStatus(status),
	) {
		super(message);
		this.name = 'HostError';
	}
}

/** The kind of a host's failure, or null for anything that is not one. */
export const hostErrorKind = (err: unknown): HostErrorKind | null => (err instanceof HostError ? err.kind : null);
