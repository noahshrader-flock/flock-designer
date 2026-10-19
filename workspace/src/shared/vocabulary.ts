/** Every message that names the host's things takes the words from here, so a second host is a second set of words. */

import { CLI_INSTALL_URL } from './hostUrls';

export const HOST = 'GitHub';
export const CHANGE_REQUEST = 'pull request';
export const ISSUE = 'issue';
export const CLI = 'gh';

/** `after`: anything more the person should know (what is kept meanwhile). */
export const needsCli = (doing: string, after = ''): string =>
	`${doing} goes through ${HOST}'s command line, ${CLI}, which is missing or not signed in here. Install it from ${CLI_INSTALL_URL} and run \`${CLI} auth login\` in a terminal, then try again.${after ? ` ${after}` : ''}`;
