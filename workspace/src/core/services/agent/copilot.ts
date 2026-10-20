import { join } from 'node:path';
import { type Agent, type Lookup, locate, lookupHere } from './agent';

/** Its command line is installed on its own (Homebrew, npm), never inside the Copilot extension. */
export const locateCopilot = (lookup: Lookup = lookupHere()): string =>
	locate('copilot', { others: [join(lookup.home, '.local', 'bin', 'copilot'), '/opt/homebrew/bin/copilot', '/usr/local/bin/copilot'] }, lookup);

/**
 * Handed work in VS Code's own Chat, which is built in and asks for its own sign-in; its command line, for a terminal,
 * when there is no Chat. Neither says who is signed in, so its readiness cannot be told, which holds nothing back. It
 * does not run unattended here: its shell rules are not a boundary.
 */
export const copilot = (deps: { locate: () => string } = { locate: () => locateCopilot() }): Agent => ({
	id: 'copilot',
	name: 'GitHub Copilot',
	readiness: async () => ({ state: 'unknown' }),
	program: deps.locate,
	// `-i` starts its screen and sends the prompt as its first message.
	startArgs: (prompt) => ['-i', prompt],
});
