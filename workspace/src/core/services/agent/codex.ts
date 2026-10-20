import { join } from 'node:path';
import { type Agent, type Lookup, type RunCommand, locate, lookupHere, readinessOf, runCommand } from './agent';

/** On the PATH, or the one OpenAI's VS Code extension bundles for this machine (`bin/<platform>/codex`). */
export const locateCodex = (lookup: Lookup = lookupHere()): string =>
	locate(
		'codex',
		{
			bundled: {
				prefix: 'openai.chatgpt-',
				inside: (extension, list) =>
					list(join(extension, 'bin')).flatMap((platform) => ['codex', 'codex.exe'].map((n) => join(extension, 'bin', platform, n))),
			},
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
	/** `codex login status` says "Logged in using …", or "Not logged in" and exits 1; on stderr today, either is read. */
	readiness: () =>
		readinessOf(
			() => deps.run(deps.locate(), ['login', 'status']),
			({ stdout, stderr }) => {
				const said = `${stderr}\n${stdout}`;
				return /^\s*Logged in\b/im.test(said) ? 'ready' : /^\s*Not logged in\b/im.test(said) ? 'signedOut' : null;
			},
			{
				missing: 'Codex is not installed. Install the Codex extension for VS Code, or its command line, sign in, then start again.',
				signedOut: 'Codex is not signed in. Run codex login in a terminal, or sign in in the Codex panel, then start again.',
			},
		),
	program: deps.locate,
	// The copy OpenAI's extension bundles will not start its interactive screen with the shared background server.
	startArgs: (prompt) => ['--no-daemon', prompt],
});
