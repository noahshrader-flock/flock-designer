/**
 * A caller tests a `HostError`'s `kind`, never a status, a class or the words of a message, so a second host only has to
 * say which kind it was.
 */

export type HostErrorKind =
	| 'notFound'
	| 'forbidden'
	/** Changed since it was read: what was written against is no longer what is there. */
	| 'conflict'
	| 'reauth'
	| 'unreachable'
	/** The person's command line for the host (`gh`) is not on this machine. */
	| 'missingCli'
	| 'rateLimited'
	| 'failed';

/** As GitHub uses them: a 422 is a lost race (a file written without the sha it now has). */
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
		readonly status?: number,
		readonly kind: HostErrorKind = kindOfStatus(status),
	) {
		super(message);
		this.name = 'HostError';
	}
}

export const hostErrorKind = (err: unknown): HostErrorKind | null => (err instanceof HostError ? err.kind : null);
