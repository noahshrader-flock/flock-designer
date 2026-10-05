import { type ChildProcess, spawn } from 'node:child_process';
import type { PreviewStatus, RunLogLine, WorkspaceDescriptor } from '../../shared/contract';
import { findCommand } from './descriptor';
import { assertUsableProjectId } from './iterations';

/**
 * Runs the commands a repository declares, and nothing else.
 *
 * Two properties carry the whole thing. The command is looked up by id in the
 * descriptor, so the renderer names a command rather than supplying one. And it
 * is spawned from an argv array with `shell: false`, so there is no interpreter
 * to hand a pipe, a semicolon or a substitution to.
 */

/**
 * A command that serves one project names it with `<project-id>` in its argv.
 * The id becomes a single argument, never part of a string a shell reads, and
 * is checked first, so it cannot carry anything but a project name.
 */
export const fillProjectId = (argv: string[], projectId?: string): string[] => {
	if (!argv.some((a) => a.includes('<project-id>'))) return argv;
	if (projectId === undefined) throw new Error('This command needs a project, and none was given.');
	assertUsableProjectId(projectId);
	return argv.map((a) => a.replaceAll('<project-id>', projectId));
};

export interface RuntimeEvents {
	onLog(line: RunLogLine): void;
	onStatus(status: PreviewStatus): void;
}

export interface RuntimeDeps {
	/** Injected so the process lifecycle can be tested without a real dev server. */
	spawnProcess: typeof spawn;
	/** Returns true once the preview answers. Injected for the same reason. */
	probe: (port: number) => Promise<boolean>;
	/** How long to wait for a preview to answer before calling it failed. */
	previewTimeoutMs: number;
}

export const httpProbe = async (port: number): Promise<boolean> => {
	try {
		const response = await fetch(`http://localhost:${port}/`, { redirect: 'manual' });
		return response.status < 500;
	} catch {
		return false;
	}
};

export const defaultDeps: RuntimeDeps = {
	spawnProcess: spawn,
	probe: httpProbe,
	previewTimeoutMs: 120_000,
};

interface Running {
	child: ChildProcess;
	status: PreviewStatus;
}

export class RuntimeManager {
	private readonly running = new Map<string, Running>();
	/**
	 * Commands the designer asked to stop.
	 *
	 * `exit` fires after `stop()` has already removed the entry, so without this
	 * the handler cannot tell a deliberate stop from a crash and reports every
	 * stopped preview as a failure.
	 */
	private readonly stopping = new Set<string>();

	constructor(
		private readonly events: RuntimeEvents,
		private readonly deps: RuntimeDeps = defaultDeps,
	) {}

	status(commandId: string): PreviewStatus {
		return this.running.get(commandId)?.status ?? { state: 'stopped' };
	}

	private setStatus(commandId: string, status: PreviewStatus): void {
		const entry = this.running.get(commandId);
		if (entry) {
			entry.status = status;
		}
		this.events.onStatus(status);
	}

	async start(
		root: string,
		descriptor: WorkspaceDescriptor,
		commandId: string,
		projectId?: string,
	): Promise<PreviewStatus> {
		if (this.running.has(commandId)) {
			return this.status(commandId);
		}
		// Throws if the repository does not declare it. This is the allowlist.
		const command = findCommand(descriptor, commandId);
		const [file, ...args] = fillProjectId(command.argv, projectId);
		if (file === undefined) {
			throw new Error(`${commandId} has an empty argv`);
		}

		const child = this.deps.spawnProcess(file, args, {
			cwd: root,
			shell: false,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: process.env,
		});

		this.running.set(commandId, { child, status: { state: 'starting', commandId } });
		this.events.onStatus({ state: 'starting', commandId });

		child.stdout?.on('data', (d: Buffer) =>
			this.events.onLog({ commandId, stream: 'stdout', text: d.toString() }),
		);
		child.stderr?.on('data', (d: Buffer) =>
			this.events.onLog({ commandId, stream: 'stderr', text: d.toString() }),
		);
		child.on('error', (err) => {
			this.stopping.delete(commandId);
			this.running.delete(commandId);
			this.events.onStatus({ state: 'failed', commandId, detail: err.message });
		});
		child.on('exit', (code) => {
			const expected = this.stopping.delete(commandId);
			this.running.delete(commandId);
			if (!expected) {
				this.events.onStatus(
					code === 0
						? { state: 'stopped' }
						: { state: 'failed', commandId, detail: `exited with code ${String(code)}` },
				);
			}
		});

		if (command.servesPreviewOn === undefined) {
			return this.status(commandId);
		}
		return this.awaitPreview(commandId, command.servesPreviewOn);
	}

	private async awaitPreview(commandId: string, port: number): Promise<PreviewStatus> {
		const deadline = Date.now() + this.deps.previewTimeoutMs;
		while (Date.now() < deadline) {
			if (!this.running.has(commandId)) {
				// It exited while we were waiting; its own handler already said why.
				return this.status(commandId);
			}
			if (await this.deps.probe(port)) {
				const status: PreviewStatus = { state: 'running', commandId, url: `http://localhost:${port}/` };
				this.setStatus(commandId, status);
				return status;
			}
			await new Promise((r) => setTimeout(r, 250));
		}
		const status: PreviewStatus = {
			state: 'failed',
			commandId,
			detail: `The preview did not answer on port ${port}. Its output is in the log.`,
		};
		this.setStatus(commandId, status);
		return status;
	}

	async stop(commandId: string): Promise<PreviewStatus> {
		const entry = this.running.get(commandId);
		if (!entry) {
			return { state: 'stopped' };
		}
		this.stopping.add(commandId);
		entry.status = { state: 'stopped' };
		entry.child.kill('SIGTERM');
		this.running.delete(commandId);
		this.events.onStatus({ state: 'stopped' });
		return { state: 'stopped' };
	}

	/** Called when the window closes, so a dev server does not outlive the app. */
	stopAll(): void {
		for (const [commandId, entry] of this.running) {
			this.stopping.add(commandId);
			entry.child.kill('SIGTERM');
		}
		this.running.clear();
	}
}
