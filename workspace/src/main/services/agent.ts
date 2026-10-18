import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { findOnPath } from './paths';
import type { AgentReadiness, AgentStatus, RunLogLine } from '../../shared/contract';
import { ProcessFailed, runFile } from './process';

/**
 * Hands a task to the agent the designer already has installed.
 *
 * Workspace does not bundle model credentials, does not carry prompts, and does
 * not restate the standards. The repository holds its own instructions and the
 * agent reads them; this passes a task reference and gets out of the way. That
 * is what keeps the workflow usable by someone who never installs this app, and
 * what keeps the adapter replaceable when a second harness turns up.
 */

/** Said wherever a second run is refused: the app runs one agent at a time. */
export const AGENT_BUSY = 'The agent is already working on something else. Wait for it to finish, then try again.';

export interface AgentExtras {
	/** Folders outside the repository the agent may also write to: the project's records in the design repository. */
	addDirs?: string[];
	/**
	 * Folders the agent may read but never change: the product repository, for a prototype that
	 * should look like it. Not working directories, so nothing there is edited even in accept-edits mode,
	 * and an edit rule denies it outright as well.
	 */
	readOnly?: string[];
	/** Which piece of work this run is for (a prototype's key), carried on its status. */
	work?: string;
	/** A run that is a Handoff, so a screen opened again knows it ends in a report, not a preview. */
	purpose?: 'handoff';
	/** The task stands alone: it is not working in a repository, so there are no repository instructions to point at. */
	bare?: boolean;
	/** The conversation's ID, chosen by the app, so the person can continue it in their editor afterwards. */
	session?: string;
	/** What the conversation is called where it is listed, so it can be recognized there. */
	name?: string;
}

export interface AgentAdapter {
	/** What the designer would call it. */
	readonly name: string;
	/** Executable plus arguments. Never a shell string. */
	argvFor(task: string, extras?: AgentExtras): string[];
	/** Turns what the tool prints into lines a person can read. Defaults to passing text through. */
	formatter?(): (chunk: string) => string[];
}

/**
 * Where to find Claude Code.
 *
 * An app opened from the Dock has none of a terminal's PATH, and many people
 * run Claude Code only inside an editor, which ships its own copy and puts
 * nothing on PATH -- which is exactly this project's author's machine. So: the
 * PATH first, then the usual install places, then the newest copy bundled with
 * an editor extension. Falls back to the bare name, whose failure message says
 * what to do.
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
 * What an unattended run may do without asking, because nobody is there to ask.
 * Edits are allowed (the work is the point). Commands are the repository's own
 * scripts and local git that adds or reads; no git command that pushes, switches
 * branch, or discards work is on the list. This is about git, not a sandbox:
 * `npm`, `npx` and `node` run whatever the repository's scripts do.
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
 * Work the agent commits is the designer's own work, committed under their name, and carries no
 * attribution line. Claude Code adds a `Co-Authored-By` trailer to its commits by default, which
 * would put one in every work's history; this turns that off for the commits (and pull
 * request text) of a run started from here.
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

/**
 * Reads Claude Code's streamed JSON and returns what a person would want to
 * see: what it says, and which file it is touching. Everything else is noise.
 * A chunk can end mid-line, so the unfinished tail is kept for the next one.
 */
/** Runs a command and resolves with what it printed, or rejects. Bounded, so a hung check never holds anything up. */
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

/**
 * Whether new work can be built here, asked before anyone types a request rather than after the branch is made.
 *
 * Claude Code says itself whether someone is signed in (`claude auth status`); only that yes or no is read. The
 * app never sees, keeps or handles the sign-in, which stays Claude Code's own. When the answer cannot be had --
 * an older Claude Code without the command, a slow machine -- it does not stand in the way: the run itself
 * still reports a real failure.
 */
export const agentReadiness = async (locate: () => string = () => locateClaude(), run: RunCommand = runCommand): Promise<AgentReadiness> => {
	const bin = locate();
	let out: string;
	try {
		out = await run(bin, ['auth', 'status', '--json']);
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
};

export const claudeStreamFormatter = (): ((chunk: string) => string[]) => {
	let tail = '';
	// The run's closing event repeats the agent's last message verbatim, so it is said once.
	let lastSaid = '';
	const describe = (line: string): string[] => {
		let e: { type?: string; message?: { content?: unknown }; subtype?: string; is_error?: boolean; result?: string };
		try {
			e = JSON.parse(line);
		} catch {
			return line.trim() ? [line.trim()] : [];
		}
		if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
			return (e.message.content as Array<Record<string, unknown>>).flatMap((b) => {
				if (b.type === 'text' && typeof b.text === 'string') return b.text.trim() ? [(lastSaid = b.text.trim())] : [];
				if (b.type === 'tool_use') {
					const input = (b.input ?? {}) as Record<string, unknown>;
					const what = input.file_path ?? input.path ?? input.command ?? input.pattern ?? '';
					return [`→ ${String(b.name)} ${String(what)}`.trim()];
				}
				return [];
			});
		}
		// What the agent says at the end is the part a person most needs: it is where it explains what
		// it changed and -- the case that matters -- why it changed nothing. Saying only "Finished."
		// threw that away, so a considered refusal looked exactly like success.
		if (e.type === 'result') {
			const said = typeof e.result === 'string' ? e.result.trim() : '';
			if (e.is_error) return [`Stopped: ${said || e.subtype || 'error'}`];
			return said && said !== lastSaid ? [said, 'Finished.'] : ['Finished.'];
		}
		return [];
	};
	return (chunk) => {
		const parts = (tail + chunk).split('\n');
		tail = parts.pop() ?? '';
		return parts.flatMap(describe);
	};
};

/** The confirmed first integration. Others slot in beside it. */
export const claudeCodeAdapter: AgentAdapter = {
	name: 'Claude Code',
	argvFor: (task, extras) => [
		locateClaude(),
		'-p',
		task,
		'--output-format',
		'stream-json',
		'--verbose',
		'--permission-mode',
		'acceptEdits',
		'--settings',
		settingsFor(extras?.readOnly ?? []),
		'--allowedTools',
		ALLOWED_TOOLS,
		'--disallowedTools',
		DISALLOWED_TOOLS,
		...(extras?.session ? ['--session-id', extras.session] : []),
		...(extras?.name ? ['--name', extras.name] : []),
		// Last: it takes a list, and would swallow anything after it.
		...(extras?.addDirs?.length ? ['--add-dir', ...extras.addDirs] : []),
	],
	formatter: claudeStreamFormatter,
};

/** How long a run to its end may take before it is stopped: a value's change takes under a minute. */
const RUN_TO_END_MS = 5 * 60_000;

/** What a run to its end said last (what it changed, or why not), and whether it ended as it should. */
export interface RunEnded {
	ok: boolean;
	said: string;
}

/**
 * A task run to its end in `cwd`, unattended, with the adapter's own permissions (no attribution, nothing that needs
 * someone there), and what it said last: for work in a scratch copy that nobody watches (writing a component's value,
 * Phase 4), so it is not the person's one run at a time (`AgentRunner`) and does not wait on it, nor it on this.
 */
export const runToEnd = (cwd: string, task: string, extras: AgentExtras = {}, deps: AgentDeps = defaultAgentDeps): Promise<RunEnded> =>
	new Promise((done) => {
		const [file, ...args] = deps.adapter.argvFor(task, extras);
		if (file === undefined) return done({ ok: false, said: 'The agent adapter produced no command.' });
		let out = '';
		let child: ChildProcess;
		try {
			child = deps.spawnProcess(file, args, { cwd, shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
		} catch (err) {
			return done({ ok: false, said: (err as Error).message });
		}
		const timer = setTimeout(() => child.kill('SIGTERM'), RUN_TO_END_MS);
		child.stdout?.on('data', (d: Buffer) => (out += d.toString()));
		// Read as it comes, or a run that says much there would wait on it; its last words are kept, for a run that fails.
		let complained = '';
		child.stderr?.on('data', (d: Buffer) => (complained = `${complained}${d.toString()}`.slice(-2000)));
		child.on('error', (err) => done({ ok: false, said: `Could not run ${deps.adapter.name}: ${err.message}.` }));
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
				said: said || complained.trim() || `${deps.adapter.name} ended without saying what it did.`,
			});
		});
	});

export interface AgentDeps {
	spawnProcess: typeof spawn;
	adapter: AgentAdapter;
}

export const defaultAgentDeps: AgentDeps = {
	spawnProcess: spawn,
	adapter: claudeCodeAdapter,
};

export class AgentRunner {
	private child: ChildProcess | null = null;
	private current: AgentStatus = { state: 'idle' };
	private work: string | null = null;
	/** Where the run is, and its conversation: a checkout must not change branch under it, and only its own conversation is taken over. */
	private root: string | null = null;
	private session: string | null = null;
	private purpose: 'handoff' | null = null;

	/** What the status carries about the run, so a screen can tell its own run from another, and what kind it is. */
	private tags(): { work: string | null; purpose: 'handoff' | null } {
		return { work: this.work, purpose: this.purpose };
	}
	/** The run's recent lines, kept here so a screen that was left and opened again can pick up where it was. */
	private recent: string[] = [];

	constructor(
		private readonly onLog: (line: RunLogLine) => void,
		private readonly deps: AgentDeps = defaultAgentDeps,
	) {}

	recentLines(): { work: string | null; lines: string[] } {
		return { work: this.work, lines: [...this.recent] };
	}

	private keep(text: string): void {
		this.recent.push(...text.split('\n').filter((l) => l.trim() !== ''));
		if (this.recent.length > 200) this.recent.splice(0, this.recent.length - 200);
	}

	status(): AgentStatus {
		return this.current;
	}

	/**
	 * The task text the agent receives.
	 *
	 * It names the project and the boundary and then stops. Everything about how
	 * to build lives in the repository's own instructions, so restating it here
	 * would create a second source that drifts from the first.
	 */
	taskFor(projectId: string, task: string): string {
		return [`Project: ${projectId}`, "Read this repository's own agent instructions and follow them.", '', task].join('\n');
	}

	/**
	 * One run at a time. The same work asked again (a screen opened twice, Try again) joins the run that is going;
	 * anything else is refused, never handed that run, or its screen would wait on someone else's work and report its own
	 * as done. Decided here, where nothing can start in between, rather than by each caller checking first.
	 */
	start(root: string, projectId: string, task: string, extras?: AgentExtras): AgentStatus {
		if (this.current.state === 'running') {
			if (extras?.work !== undefined && extras.work === this.work) return this.current;
			throw new Error(AGENT_BUSY);
		}
		const argv = this.deps.adapter.argvFor(extras?.bare ? task : this.taskFor(projectId, task), extras);
		const [file, ...args] = argv;
		if (file === undefined) {
			this.current = { state: 'unavailable', detail: 'The agent adapter produced no command.' };
			return this.current;
		}

		let child: ChildProcess;
		try {
			child = this.deps.spawnProcess(file, args, {
				cwd: root,
				shell: false,
				stdio: ['ignore', 'pipe', 'pipe'],
				env: process.env,
			});
		} catch (err) {
			this.current = { state: 'unavailable', detail: (err as Error).message };
			return this.current;
		}

		this.child = child;
		this.work = extras?.work ?? null;
		this.root = root;
		this.session = extras?.session ?? null;
		this.recent = [];
		this.purpose = extras?.purpose ?? null;
		this.current = { state: 'running', startedAt: new Date().toISOString(), ...this.tags() };

		const format = this.deps.adapter.formatter?.();
		child.stdout?.on('data', (d: Buffer) => {
			if (!format) {
				this.keep(d.toString());
				return this.onLog({ commandId: 'agent', stream: 'stdout', text: d.toString() });
			}
			for (const text of format(d.toString())) {
				this.keep(text);
				this.onLog({ commandId: 'agent', stream: 'stdout', text: `${text}\n` });
			}
		});
		child.stderr?.on('data', (d: Buffer) => this.onLog({ commandId: 'agent', stream: 'stderr', text: d.toString() }));
		child.on('error', (err) => {
			this.child = null;
			this.current = {
				state: 'unavailable',
				detail: `Could not run ${this.deps.adapter.name}: ${err.message}. Is it installed and on PATH?`,
			};
		});
		child.on('exit', (code) => {
			this.child = null;
			// A crash and a clean finish are both "finished" with a code. The caller
			// decides what a non-zero code means; this does not editorialize.
			this.current = { state: 'finished', exitCode: code ?? -1, ...this.tags() };
		});

		return this.current;
	}

	/** Whether a run is going on in this folder. */
	runningIn(root: string): boolean {
		return this.current.state === 'running' && this.root === root;
	}

	/** The conversation of the run that is going, if the app named it. */
	runningSession(): string | null {
		return this.current.state === 'running' ? this.session : null;
	}

	/** Asks the run to end. The status says finished once it has (the exit handler), not before. */
	stop(): void {
		this.child?.kill('SIGTERM');
	}
}
