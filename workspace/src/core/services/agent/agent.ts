import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { findOnPath } from '../platform/paths';
import type { AgentReadiness } from '../../../shared/contract';
import { GROUP, ProcessFailed, endGroup, runFile } from '../platform/process';
import { startCommand } from './terminal';

/**
 * No bundled credentials, prompts or restated standards, since the repository holds its own instructions: that keeps the
 * workflow usable without DSNR.
 */

export type AgentId = 'claude-code';

/** `said`: what it changed, or why not. */
export interface RunEnded {
	ok: boolean;
	said: string;
}

/** An agent DSNR hands work to. What names one agent, its commands and its words, is in its adapter and nowhere else. */
export interface Agent {
	readonly id: AgentId;
	readonly name: string;
	/** The bare name when it is found nowhere, whose failure says what to do. */
	locate(): string;
	/** Read only: what it says of its sign-in, never the sign-in itself. */
	readiness(): Promise<AgentReadiness>;
	/** Said when it is not ready, and nothing is handed over. */
	notReady: { missing: string; signedOut: string };
	/** Starts it in `root` with `prompt` typed in, for a terminal, when its own window is not in this editor. */
	terminalCommand(root: string, prompt: string): string;
	/** Only an agent that can be held to editing `cwd`, and nothing it may only read, declares it. */
	runUnattended?(cwd: string, task: string, options: { readOnly: string[] }): Promise<RunEnded>;
}

/**
 * Editor extensions are looked in too, as many run Claude Code only there, with nothing on PATH. Falls back to the bare
 * name, whose failure says what to do.
 */
export const locateClaude = (
	env: NodeJS.ProcessEnv = process.env,
	home: string = homedir(),
	exists: (p: string) => boolean = existsSync,
	list: (dir: string) => string[] = (d) => (existsSync(d) ? readdirSync(d) : []),
): string => {
	const onPath = findOnPath('claude', env, exists);
	if (onPath) return onPath;
	for (const p of [
		join(home, '.claude', 'local', 'claude'),
		join(home, '.local', 'bin', 'claude'),
		'/opt/homebrew/bin/claude',
		'/usr/local/bin/claude',
	]) {
		if (exists(p)) return p;
	}
	for (const editor of ['.vscode', '.vscode-insiders', '.cursor']) {
		const dir = join(home, editor, 'extensions');
		const versions = list(dir)
			.filter((n) => n.startsWith('anthropic.claude-code-'))
			.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
		for (const v of versions) {
			const bin = join(dir, v, 'resources', 'native-binary', 'claude');
			if (exists(bin)) return bin;
		}
	}
	return 'claude';
};

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

/** Bounded, so a hung check never holds anything up. */
type RunCommand = (file: string, args: string[]) => Promise<string>;
const runCommand: RunCommand = (file, args) =>
	runFile(file, args, { timeoutMs: 10_000 }).then(
		(r) => r.stdout,
		(err: unknown) => {
			// A command that answers and then exits non-zero (as a "no" may) still answered.
			if (err instanceof ProcessFailed && err.stdout.trim()) return err.stdout;
			throw err;
		},
	);

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
	locate: deps.locate,
	/**
	 * Only `claude auth status`'s yes or no is read. No answer (an older Claude Code, a slow machine) does not stand in the
	 * way: what it is handed still says a real failure.
	 */
	readiness: async () => {
		let out: string;
		try {
			out = await deps.run(deps.locate(), ['auth', 'status', '--json']);
		} catch (err) {
			// The bare name is what locating falls back to when it found nothing anywhere.
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { state: 'missing' };
			return { state: 'unknown' };
		}
		try {
			const status = JSON.parse(out) as { loggedIn?: unknown };
			if (status.loggedIn === true) return { state: 'ready' };
			if (status.loggedIn === false) return { state: 'signedOut' };
		} catch {
			// Not the JSON this was asked for.
		}
		return { state: 'unknown' };
	},
	notReady: {
		missing: 'Claude Code is not installed. Install it from claude.com/claude-code, sign in, then start again.',
		signedOut: 'Claude Code is not signed in. Sign in in the Claude Code panel, or by running claude in a terminal, then start again.',
	},
	terminalCommand: (root, prompt) => startCommand(deps.locate(), root, prompt),
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
