/**
 * The host's words, as a person reads them: what the app says it is, what it calls a change request and a review thread,
 * and its command line. Every message that names one of them takes it from here, so a second host is a second set of
 * words, not a sweep through every sentence.
 */

/** The host, by its name. */
export const HOST = 'GitHub';
/** What the host calls a change proposed from a branch. */
export const CHANGE_REQUEST = 'pull request';
/** What the host calls the thread a review's comments are kept in. */
export const THREAD = 'issue';
/** The host's own command line, as a person types it. */
export const CLI = 'gh';

/**
 * Why `doing` cannot happen here, when it goes through the person's own command line for the host: one sentence for
 * every place that needs it, with what to do. `after`: anything more the person should know (what is kept meanwhile).
 */
export const needsCli = (doing: string, after = ''): string =>
	`${doing} goes through ${HOST}'s command line, ${CLI}, which is missing or not signed in here. Install it from https://cli.github.com and run \`${CLI} auth login\` in a terminal, then try again.${after ? ` ${after}` : ''}`;
