import { type ChildProcess, execFile } from 'node:child_process';

/**
 * Argv only, never a shell, always within a time limit, so one that hangs (a credential helper, a question nobody sees)
 * fails with a reason instead of holding up what waits on it.
 */

export const DEFAULT_TIMEOUT_MS = 60_000;

export interface RunOptions {
	cwd?: string;
	/** Added to this process's environment. */
	env?: Record<string, string | undefined>;
	timeoutMs?: number;
	input?: string;
	maxBuffer?: number;
	/** Ends it when aborted, as a person's Stop does; it then fails as stopped. */
	signal?: AbortSignal;
}

export interface RunResult {
	stdout: string;
	stderr: string;
}

export class NotInstalled extends Error {
	readonly code = 'ENOENT';
	constructor(readonly program: string) {
		super(`${program} is not installed here, or is not where it was looked for.`);
		this.name = 'NotInstalled';
	}
}

/** What it printed is kept, since some failures still answer. */
export class ProcessFailed extends Error {
	constructor(
		message: string,
		readonly stdout: string,
		readonly stderr: string,
		readonly code: number | null,
		readonly timedOut: boolean,
	) {
		super(message);
		this.name = 'ProcessFailed';
	}
}

export const runFile = (
	file: string,
	args: string[],
	{ cwd, env, timeoutMs = DEFAULT_TIMEOUT_MS, input, maxBuffer = 16 * 1024 * 1024, signal }: RunOptions = {},
) =>
	new Promise<RunResult>((resolve, reject) => {
		const child = execFile(
			file,
			args,
			{ cwd, env: env ? { ...process.env, ...env } : process.env, timeout: timeoutMs, maxBuffer, encoding: 'utf8', signal },
			(err, stdout, stderr) => {
				if (!err) return resolve({ stdout, stderr });
				if ((err as NodeJS.ErrnoException).code === 'ENOENT') return reject(new NotInstalled(file));
				const timedOut = err.killed === true && err.signal === 'SIGTERM' && signal?.aborted !== true;
				const message = signal?.aborted
					? `${file} was stopped.`
					: timedOut
						? `${file} did not finish within ${timeoutMs / 1000} s, so it was stopped.`
						: stderr.trim() || err.message;
				reject(new ProcessFailed(message, stdout, stderr, typeof err.code === 'number' ? err.code : null, timedOut));
			},
		);
		if (input !== undefined) {
			// A program may exit without reading all of it (`gh` not installed, or one that fails at once): the write then
			// finds the pipe closed. How the program ended is what answers, above; the closed pipe is not a second failure.
			child.stdin?.on('error', () => undefined);
			child.stdin?.end(input);
		}
	});

/**
 * A long-running program started so it can be ended whole: on its own process group (`GROUP`), so stopping it reaches what
 * it started too (npm's dev server under npm, the agent's tools under the agent). Windows has no process groups: there the
 * program alone is ended.
 */
export const GROUP = { detached: process.platform !== 'win32' } as const;

const signalGroup = (child: ChildProcess, signal: NodeJS.Signals): void => {
	try {
		if (GROUP.detached && child.pid !== undefined) process.kill(-child.pid, signal);
		else child.kill(signal);
	} catch {
		// Nothing of the group is left to signal.
	}
};

const stillRunning = (child: ChildProcess): boolean => {
	if (!GROUP.detached || child.pid === undefined) return child.exitCode === null && child.signalCode === null;
	try {
		process.kill(-child.pid, 0);
		return true;
	} catch {
		return false;
	}
};

/**
 * Ends a program started with `GROUP`, and everything it started: SIGTERM to all of them, and once `graceMs` has passed with
 * any still running, SIGKILL to those, which a dev server ignoring SIGTERM would otherwise be, keeping its port. Resolves
 * once all of them are gone and the program's exit is handled, or a second after the SIGKILL.
 */
export const endGroup = async (child: ChildProcess, graceMs = 5_000): Promise<void> => {
	const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
	// Heard before anything is signalled, so its exit is never missed: a group can be gone a moment before Node has handled
	// its leader's exit, and whoever waits on this sees the program as ended once it resolves.
	const handled = child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise<void>((r) => child.once('exit', () => r()));
	signalGroup(child, 'SIGTERM');
	for (const until = Date.now() + graceMs; stillRunning(child) && Date.now() < until;) await pause(100);
	if (stillRunning(child)) {
		signalGroup(child, 'SIGKILL');
		for (const until = Date.now() + 1_000; stillRunning(child) && Date.now() < until;) await pause(50);
	}
	await Promise.race([handled, pause(1_000)]);
};
