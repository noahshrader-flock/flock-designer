import { join } from 'node:path';
import { type Agent, type Lookup, type RunCommand, isMissing, locate, lookupHere, runCommand } from './agent';

/** On the PATH, or the one OpenAI's VS Code extension bundles for this machine (`bin/<platform>/codex`). */
export const locateCodex = (lookup: Lookup = lookupHere()): string =>
	locate(
		'codex',
		{
			prefix: 'openai.chatgpt-',
			inside: (extension, list) =>
				list(join(extension, 'bin')).flatMap((platform) => ['codex', 'codex.exe'].map((n) => join(extension, 'bin', platform, n))),
		},
		lookup,
	);

export interface CodexDeps {
	locate: () => string;
	run: RunCommand;
}

const defaultCodexDeps: CodexDeps = { locate: () => locateCodex(), run: runCommand };

/**
 * Handed work in a terminal only: its VS Code extension takes no prompt, and it has no command allow-list, so it does not
 * run unattended here.
 */
export const codex = (deps: CodexDeps = defaultCodexDeps): Agent => ({
	id: 'codex',
	name: 'Codex',
	/** `codex login status` says, on stderr, "Logged in using …", or "Not logged in" and exits 1. */
	readiness: async () => {
		let out: string;
		try {
			out = (await deps.run(deps.locate(), ['login', 'status'])).stderr;
		} catch (err) {
			if (isMissing(err)) return { state: 'missing' };
			return { state: 'unknown' };
		}
		if (/^\s*Logged in\b/i.test(out)) return { state: 'ready' };
		if (/^\s*Not logged in\b/i.test(out)) return { state: 'signedOut' };
		return { state: 'unknown' };
	},
	notReady: {
		missing: 'Codex is not installed. Install the Codex extension for VS Code, or its command line, sign in, then start again.',
		signedOut: 'Codex is not signed in. Run codex login in a terminal, or sign in in the Codex panel, then start again.',
	},
	program: deps.locate,
	// The copy OpenAI's extension bundles will not start its interactive screen with the shared background server.
	startArgs: (prompt) => ['--no-daemon', prompt],
});
