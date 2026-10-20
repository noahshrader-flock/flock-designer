import { type ChildProcess, spawn } from 'node:child_process';
import { join } from 'node:path';
import { GROUP, endGroup } from '../platform/process';
import { type Agent, type Lookup, type RunCommand, locate, lookupHere, readinessOf, runCommand } from './agent';

/** Its own installer's place comes before an editor's copy. */
export const locateClaude = (lookup: Lookup = lookupHere()): string =>
	locate(
		'claude',
		{
			others: [join(lookup.home, '.claude', 'local', 'claude')],
			bundled: { prefix: 'anthropic.claude-code-', inside: (extension) => [join(extension, 'resources', 'native-binary', 'claude')] },
		},
		lookup,
	);

/**
 * What an unattended run may do without asking: edits, the repository's scripts, and local git that adds or reads, never
 * one that pushes, switches branch or discards work. Not a sandbox: `npm`, `npx` and `node` run whatever the scripts do.
 */
const ALLOWED_TOOLS = [
	'Bash(npm run:*)',
	'Bash(npm test:*)',
	'Bash(npx:*)',
	'Bash(node:*)',
	'Bash(git status:*)',
	'Bash(git diff:*)',
	'Bash(git log:*)',
	// Reading other branches and the tree, which the guidance asks for and which change nothing.
	'Bash(git show:*)',
	'Bash(git rev-parse:*)',
	// Only the forms that read: `git branch` itself also deletes, moves and forces.
	'Bash(git branch --show-current)',
	'Bash(git branch --list:*)',
	'Bash(git ls-files:*)',
	'Bash(git ls-tree:*)',
	'Bash(git add:*)',
	'Bash(git commit:*)',
	'Bash(ls:*)',
	'Bash(mkdir:*)',
].join(',');

/**
 * Nobody is there to answer a run started from here, and the run ends when the agent's turn does. These
 * tools only make sense with someone around later: a reminder to come back would be work left half done.
 */
const DISALLOWED_TOOLS = ['ScheduleWakeup', 'CronCreate', 'CronDelete', 'RemoteTrigger', 'PushNotification', 'AskUserQuestion'].join(',');

/**
 * Work the agent commits is the designer's own, so this turns off Claude Code's default `Co-Authored-By` trailer for a
 * run's commits and pull request text, which would otherwise be in every branch's history.
 */
const settingsFor = (readOnly: string[]): string =>
	JSON.stringify({
		attribution: { commit: '', pr: '' },
		// `//` is an absolute path in a permission rule; a single `/` would mean the settings' own folder.
		...(readOnly.length
			? {
					permissions: {
						allow: readOnly.map((d) => `Read(/${d}/**)`),
						deny: readOnly.flatMap((d) => [`Edit(/${d}/**)`, `Write(/${d}/**)`]),
					},
				}
			: {}),
	});

/** Never a shell string. */
export const claudeArgv = (claude: string, task: string, readOnly: string[]): string[] => [
	claude,
	'-p',
	task,
	'--output-format',
	'stream-json',
	'--verbose',
	'--permission-mode',
	'acceptEdits',
	'--settings',
	settingsFor(readOnly),
	'--allowedTools',
	ALLOWED_TOOLS,
	'--disallowedTools',
	DISALLOWED_TOOLS,
];

/** How long a run to its end may take before it is stopped: a value's change takes under a minute. */
const RUN_TO_END_MS = 5 * 60_000;

export interface ClaudeDeps {
	locate: () => string;
	run: RunCommand;
	spawnProcess: typeof spawn;
}

const defaultClaudeDeps: ClaudeDeps = { locate: () => locateClaude(), run: runCommand, spawnProcess: spawn };

export const claudeCode = (deps: ClaudeDeps = defaultClaudeDeps): Agent => ({
	id: 'claude-code',
	name: 'Claude Code',
	/**
	 * Only `claude auth status`'s yes or no is read. No answer (an older Claude Code, a slow machine) does not stand in the
	 * way: what it is handed still says a real failure.
	 */
	readiness: () =>
		readinessOf(
			() => deps.run(deps.locate(), ['auth', 'status', '--json']),
			({ stdout }) => {
				try {
					const { loggedIn } = JSON.parse(stdout) as { loggedIn?: unknown };
					return loggedIn === true ? 'ready' : loggedIn === false ? 'signedOut' : null;
				} catch {
					// Not the JSON this was asked for.
					return null;
				}
			},
			{
				missing: 'Claude Code is not installed. Install it from claude.com/claude-code, sign in, then start again.',
				signedOut: 'Claude Code is not signed in. Sign in in the Claude Code panel, or by running claude in a terminal, then start again.',
			},
		),
	program: deps.locate,
	startArgs: (prompt) => [prompt],
	runUnattended: (cwd, task, { readOnly }) =>
		new Promise((done) => {
			const [file, ...args] = claudeArgv(deps.locate(), task, readOnly) as [string, ...string[]];
			let out = '';
			let child: ChildProcess;
			try {
				child = deps.spawnProcess(file, args, { ...GROUP, cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
			} catch (err) {
				return done({ ok: false, said: (err as Error).message });
			}
			const timer = setTimeout(() => void endGroup(child), RUN_TO_END_MS);
			child.stdout?.on('data', (d: Buffer) => (out += d.toString()));
			// Read as it comes, or a run that says much there would wait on it; its last words are kept, for a run that fails.
			let complained = '';
			child.stderr?.on('data', (d: Buffer) => (complained = `${complained}${d.toString()}`.slice(-2000)));
			child.on('error', (err) => done({ ok: false, said: `Could not run Claude Code: ${err.message}.` }));
			child.on('exit', (code) => {
				clearTimeout(timer);
				// The stream's closing event says how it ended, and repeats what the agent said last.
				const result = out
					.split('\n')
					.map((line) => {
						try {
							return JSON.parse(line) as { type?: string; is_error?: boolean; result?: string };
						} catch {
							return null;
						}
					})
					.find((e) => e?.type === 'result');
				const said = typeof result?.result === 'string' ? result.result.trim() : '';
				done({
					ok: code === 0 && result?.is_error === false,
					said: said || complained.trim() || 'Claude Code ended without saying what it did.',
				});
			});
		}),
});
