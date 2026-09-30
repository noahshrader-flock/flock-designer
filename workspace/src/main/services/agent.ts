import { type ChildProcess, spawn } from 'node:child_process';
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

export interface AgentAdapter {
	/** What the designer would call it. */
	readonly name: string;
	/** Executable plus arguments. Never a shell string. */
	argvFor(task: string): string[];
}

/** The confirmed first integration. Others slot in beside it. */
export const claudeCodeAdapter: AgentAdapter = {
	name: 'Claude Code',
	argvFor: (task) => ['claude', task],
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

	start(root: string, projectId: string, task: string): AgentStatus {
		if (this.current.state === 'running') {
			return this.current;
		}
		const argv = this.deps.adapter.argvFor(this.taskFor(projectId, task));
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

		child.stdout?.on('data', (d: Buffer) =>
			this.onLog({ commandId: 'agent', stream: 'stdout', text: d.toString() }),
		);
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
