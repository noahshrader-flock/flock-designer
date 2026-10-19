import { type ChildProcess, spawn } from 'node:child_process';
import { GROUP, endGroup } from '../platform/process';
import type { PreviewStatus, RunLogLine } from '../../../shared/contract';
import type { WorkspaceDescriptor } from '../projects/descriptor';
import { findCommand } from '../projects/descriptor';
import { assertUsableProjectId } from '../projects/workRecords';

/**
 * Runs the commands a repository declares, and nothing else: each is looked up by id in the descriptor, so a page names
 * a command rather than supplying one, and spawned from an argv array with `shell: false`, so there is no interpreter
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
	spawnProcess: typeof spawn;
	probe: (port: number) => Promise<boolean>;
	previewTimeoutMs: number;
}

export const httpProbe = async (port: number): Promise<boolean> => {
	try {
		// A probe, asked again shortly: a server that does not answer in two seconds is not up yet.
		const response = await fetch(`http://localhost:${port}/`, { redirect: 'manual', signal: AbortSignal.timeout(2000) });
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
	projectId: string | null;
}

/**
 * A preview is shown inside DSNR, so its server must not also open a browser tab, as most dev servers do by default:
 * `CI` (rsbuild and others) and `BROWSER=none` (Vite, webpack-dev-server, Create React App) cover the common ones.
 */
const QUIET_PREVIEW = { CI: 'true', BROWSER: 'none' } as const;

export class RuntimeManager {
	private readonly running = new Map<string, Running>();
	/**
	 * Commands the designer asked to stop: without this, the `exit` handler cannot tell a deliberate stop from a crash,
	 * and reports every stopped preview as a failure.
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

	async start(root: string, descriptor: WorkspaceDescriptor, commandId: string, projectId?: string): Promise<PreviewStatus> {
		const current = this.running.get(commandId);
		if (current) {
			if (current.projectId === projectId) return this.status(commandId);
			// Every prototype is served on the same port, so a different project asking for it means the one running has
			// to go first; reused, it would show whichever prototype had been run before.
			await this.stop(commandId);
		}
		// Throws if the repository does not declare it. This is the allowlist.
		const command = findCommand(descriptor, commandId);
		const [file, ...args] = fillProjectId(command.argv, projectId);
		if (file === undefined) {
			throw new Error(`${commandId} has an empty argv`);
		}

		const child = this.deps.spawnProcess(file, args, {
			...GROUP,
			cwd: root,
			shell: false,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: command.servesPreviewOn === undefined ? process.env : { ...process.env, ...QUIET_PREVIEW },
		});

		this.running.set(commandId, { child, projectId: projectId ?? null, status: { state: 'starting', commandId, projectId: projectId ?? null } });
		this.events.onStatus({ state: 'starting', commandId, projectId: projectId ?? null });

		child.stdout?.on('data', (d: Buffer) => this.events.onLog({ commandId, stream: 'stdout', text: d.toString() }));
		child.stderr?.on('data', (d: Buffer) => this.events.onLog({ commandId, stream: 'stderr', text: d.toString() }));
		child.on('error', (err) => {
			this.stopping.delete(commandId);
			this.running.delete(commandId);
			this.events.onStatus({ state: 'failed', commandId, detail: err.message });
		});
		child.on('exit', (code) => {
			const expected = this.stopping.delete(commandId);
			this.running.delete(commandId);
			if (!expected) {
				this.events.onStatus(code === 0 ? { state: 'stopped' } : { state: 'failed', commandId, detail: `exited with code ${String(code)}` });
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
				const status: PreviewStatus = {
					state: 'running',
					commandId,
					url: `http://localhost:${port}/`,
					projectId: this.running.get(commandId)?.projectId ?? null,
				};
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
		// The entry stays until the child, and all it started, is actually gone, so the next `start` waits rather than
		// racing the old dev server for its port, and the probe never answers from the dying one.
		await endGroup(entry.child);
		this.running.delete(commandId);
		this.events.onStatus({ state: 'stopped' });
		return { state: 'stopped' };
	}

	/** Called when DSNR stops, so no dev server, nor anything one started, outlives it. Resolves once they are gone. */
	stopAll(): Promise<void> {
		const ending = [...this.running].map(([commandId, entry]) => {
			this.stopping.add(commandId);
			return endGroup(entry.child);
		});
		this.running.clear();
		return Promise.all(ending).then(() => undefined);
	}
}
