import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { findOnPath } from '../platform/paths';
import type { AgentReadiness, AgentStatus, RunLogLine } from '../../../shared/contract';
import { GROUP, ProcessFailed, endGroup, runFile } from '../platform/process';

/**
 * No bundled credentials, prompts or restated standards, since the repository holds its own instructions: that keeps the
 * workflow usable without DSNR.
 */

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
	/** A prototype's key, carried on its status. */
	work?: string;
	/** A run that is a Handoff, so a screen opened again knows it ends in a report, not a preview. */
	purpose?: 'handoff';
	/** Chosen by the app, so the person can continue the conversation in their editor afterwards. */
	session?: string;
	name?: string;
}

export interface AgentAdapter {
	readonly name: string;
	/** Never a shell string. */
	argvFor(task: string, extras?: AgentExtras): string[];
	/** Without one, text is passed through. */
	formatter?(): (chunk: string) => string[];
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

/**
 * Only `claude auth status`'s yes or no is read, never the sign-in itself. No answer (an older Claude Code, a slow
 * machine) does not stand in the way: the run itself still reports a real failure.
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

/** A chunk can end mid-line, so the unfinished tail is kept for the next one. */
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
		// The agent's last words say what it changed or why it changed nothing; without them a considered refusal would
		// look exactly like success.
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

/** `said`: what it changed, or why not. */
export interface RunEnded {
	ok: boolean;
	said: string;
}

/**
 * For work in a scratch copy nobody watches, so it is apart from the person's one run at a time (`AgentRunner`), and
 * neither waits on the other.
 */
export const runToEnd = (cwd: string, task: string, extras: AgentExtras = {}, deps: AgentDeps = defaultAgentDeps): Promise<RunEnded> =>
	new Promise((done) => {
		const [file, ...args] = deps.adapter.argvFor(task, extras);
		if (file === undefined) return done({ ok: false, said: 'The agent adapter produced no command.' });
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

export type AgentEnd = { state: 'finished'; exitCode: number } | { state: 'stopped' } | { state: 'unavailable'; detail: string };

/** Throws, in words, unless the run finished with code 0 or was stopped. */
export const afterRun = (end: AgentEnd): 'finished' | 'stopped' => {
	if (end.state === 'stopped') return 'stopped';
	if (end.state === 'unavailable') throw new Error(end.detail);
	if (end.exitCode !== 0) throw new Error(`The agent stopped with code ${end.exitCode}.`);
	return 'finished';
};

export class AgentRunner {
	private child: ChildProcess | null = null;
	private ending: Promise<AgentEnd> | null = null;
	private stopping = false;
	private current: AgentStatus = { state: 'idle' };
	private work: string | null = null;
	/** A checkout must not change branch under the run, and only its own conversation is taken over. */
	private root: string | null = null;
	private session: string | null = null;
	private purpose: 'handoff' | null = null;

	private tags(): { work: string | null; purpose: 'handoff' | null } {
		return { work: this.work, purpose: this.purpose };
	}
	/** Kept here so a screen that was left and opened again can pick up where it was. */
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
	 * How to build lives in the repository's own instructions; restating it here would make a second source that drifts.
	 */
	taskFor(projectId: string, task: string): string {
		return [`Project: ${projectId}`, "Read this repository's own agent instructions and follow them.", '', task].join('\n');
	}

	/** Resolves when the run's process has exited, never guessed. */
	run(root: string, projectId: string, task: string, extras?: AgentExtras): Promise<AgentEnd> {
		const started = this.start(root, projectId, task, extras);
		if (started.state === 'unavailable') return Promise.resolve({ state: 'unavailable', detail: started.detail });
		return this.ending as Promise<AgentEnd>;
	}

	/** Null when no run for `work` is going on. */
	ended(work: string): Promise<AgentEnd> | null {
		return this.current.state === 'running' && this.work === work ? this.ending : null;
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
		const argv = this.deps.adapter.argvFor(this.taskFor(projectId, task), extras);
		const [file, ...args] = argv;
		if (file === undefined) {
			this.current = { state: 'unavailable', detail: 'The agent adapter produced no command.' };
			return this.current;
		}

		let child: ChildProcess;
		try {
			child = this.deps.spawnProcess(file, args, {
				...GROUP,
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
		this.stopping = false;
		let end: (how: AgentEnd) => void = () => undefined;
		this.ending = new Promise<AgentEnd>((resolve) => (end = resolve));
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
			this.ending = null;
			const detail = `Could not run ${this.deps.adapter.name}: ${err.message}. Is it installed and on PATH?`;
			this.current = { state: 'unavailable', detail };
			end({ state: 'unavailable', detail });
		});
		child.on('exit', (code) => {
			this.child = null;
			this.ending = null;
			// A crash and a clean finish are both "finished" with a code. The caller
			// decides what a non-zero code means; this does not editorialize.
			this.current = { state: 'finished', exitCode: code ?? -1, ...this.tags() };
			end(this.stopping ? { state: 'stopped' } : { state: 'finished', exitCode: code ?? -1 });
		});

		return this.current;
	}

	runningIn(root: string): boolean {
		return this.current.state === 'running' && this.root === root;
	}

	runningSession(): string | null {
		return this.current.state === 'running' ? this.session : null;
	}

	/** The status says finished once the run has ended (the exit handler), not before. */
	stop(): Promise<void> {
		if (!this.child) return Promise.resolve();
		this.stopping = true;
		return endGroup(this.child);
	}
}
