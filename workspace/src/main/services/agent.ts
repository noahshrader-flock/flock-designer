import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import type { AgentStatus, RunLogLine } from '../../shared/contract';

/**
 * Hands a task to the agent the designer already has installed.
 *
 * Workspace does not bundle model credentials, does not carry prompts, and does
 * not restate the standards. The repository holds its own instructions and the
 * agent reads them; this passes a task reference and gets out of the way. That
 * is what keeps the workflow usable by someone who never installs this app, and
 * what keeps the adapter replaceable when a second harness turns up.
 */

export interface AgentExtras {
	/** Folders outside the repository the agent may also write to: the project's records in the design repository. */
	addDirs?: string[];
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
	for (const dir of (env.PATH ?? '').split(delimiter).filter(Boolean)) {
		if (exists(join(dir, 'claude'))) return join(dir, 'claude');
	}
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
			.sort((a, b) =>
				b.localeCompare(a, undefined, { numeric: true }),
			);
		for (const v of versions) {
			const bin = join(dir, v, 'resources', 'native-binary', 'claude');
			if (exists(bin)) return bin;
		}
	}
	return 'claude';
};

/**
 * What an unattended run may do without asking, because nobody is there to ask.
 * Edits are allowed (the prototype is the point). Commands are limited to
 * running the repository's own scripts and ordinary local git; nothing that
 * pushes, switches branch, or discards work is on the list.
 */
const ALLOWED_TOOLS = [
	'Bash(npm run:*)',
	'Bash(npm test:*)',
	'Bash(npx:*)',
	'Bash(node:*)',
	'Bash(git status:*)',
	'Bash(git diff:*)',
	'Bash(git log:*)',
	'Bash(git add:*)',
	'Bash(git commit:*)',
	'Bash(ls:*)',
	'Bash(mkdir:*)',
].join(',');

/**
 * Reads Claude Code's streamed JSON and returns what a person would want to
 * see: what it says, and which file it is touching. Everything else is noise.
 * A chunk can end mid-line, so the unfinished tail is kept for the next one.
 */
export const claudeStreamFormatter = (): ((chunk: string) => string[]) => {
	let tail = '';
	const describe = (line: string): string[] => {
		let e: { type?: string; message?: { content?: unknown }; subtype?: string; is_error?: boolean; result?: string };
		try {
			e = JSON.parse(line);
		} catch {
			return line.trim() ? [line.trim()] : [];
		}
		if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
			return (e.message.content as Array<Record<string, unknown>>).flatMap((b) => {
				if (b.type === 'text' && typeof b.text === 'string') return b.text.trim() ? [b.text.trim()] : [];
				if (b.type === 'tool_use') {
					const input = (b.input ?? {}) as Record<string, unknown>;
					const what = input.file_path ?? input.path ?? input.command ?? input.pattern ?? '';
					return [`→ ${String(b.name)} ${String(what)}`.trim()];
				}
				return [];
			});
		}
		if (e.type === 'result') return [e.is_error ? `Stopped: ${e.result ?? e.subtype ?? 'error'}` : 'Finished.'];
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
		'--allowedTools',
		ALLOWED_TOOLS,
		// Last: it takes a list, and would swallow anything after it.
		...(extras?.addDirs?.length ? ['--add-dir', ...extras.addDirs] : []),
	],
	formatter: claudeStreamFormatter,
};

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

	constructor(
		private readonly onLog: (line: RunLogLine) => void,
		private readonly deps: AgentDeps = defaultAgentDeps,
	) {}

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
		return [
			`Project: ${projectId}`,
			'Read this repository\'s own agent instructions and follow them.',
			'',
			task,
		].join('\n');
	}

	start(root: string, projectId: string, task: string, extras?: AgentExtras): AgentStatus {
		if (this.current.state === 'running') {
			return this.current;
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
		this.current = { state: 'running', startedAt: new Date().toISOString() };

		const format = this.deps.adapter.formatter?.();
		child.stdout?.on('data', (d: Buffer) => {
			if (!format) return this.onLog({ commandId: 'agent', stream: 'stdout', text: d.toString() });
			for (const text of format(d.toString())) this.onLog({ commandId: 'agent', stream: 'stdout', text: `${text}\n` });
		});
		child.stderr?.on('data', (d: Buffer) =>
			this.onLog({ commandId: 'agent', stream: 'stderr', text: d.toString() }),
		);
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
			// decides what a non-zero code means; this does not editorialise.
			this.current = { state: 'finished', exitCode: code ?? -1 };
		});

		return this.current;
	}

	stop(): void {
		this.child?.kill('SIGTERM');
		this.child = null;
	}
}
