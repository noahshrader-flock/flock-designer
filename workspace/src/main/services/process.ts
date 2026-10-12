import { execFile } from 'node:child_process';

/**
 * The one way the app runs a program and waits for it: argv only, never a shell, and always within a time limit, so a
 * program that hangs (a credential helper waiting on someone, a tool asking a question nobody sees) fails with a reason
 * instead of holding up whatever waits behind it. Output that streams while it runs is `streamed.ts`'s.
 */

/** What a program is given when nothing says otherwise. */
export const DEFAULT_TIMEOUT_MS = 60_000;

export interface RunOptions {
	cwd?: string;
	/** Added to this process's environment. */
	env?: Record<string, string | undefined>;
	timeoutMs?: number;
	/** Written to its input, all at once. */
	input?: string;
	maxBuffer?: number;
}

export interface RunResult {
	stdout: string;
	stderr: string;
}

/** A program that is not on this machine (or not where it was looked for). */
export class NotInstalled extends Error {
	readonly code = 'ENOENT';
	constructor(readonly program: string) {
		super(`${program} is not installed here, or is not where it was looked for.`);
		this.name = 'NotInstalled';
	}
}

/** A program that ran and failed, or ran past its time: what it printed is kept, since some failures still answer. */
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
	{ cwd, env, timeoutMs = DEFAULT_TIMEOUT_MS, input, maxBuffer = 16 * 1024 * 1024 }: RunOptions = {},
) =>
	new Promise<RunResult>((resolve, reject) => {
		const child = execFile(
			file,
			args,
			{ cwd, env: env ? { ...process.env, ...env } : process.env, timeout: timeoutMs, maxBuffer, encoding: 'utf8' },
			(err, stdout, stderr) => {
				if (!err) return resolve({ stdout, stderr });
				if ((err as NodeJS.ErrnoException).code === 'ENOENT') return reject(new NotInstalled(file));
				const timedOut = err.killed === true && err.signal === 'SIGTERM';
				const message = timedOut ? `${file} did not finish within ${timeoutMs / 1000} s, so it was stopped.` : stderr.trim() || err.message;
				reject(new ProcessFailed(message, stdout, stderr, typeof err.code === 'number' ? err.code : null, timedOut));
			},
		);
		if (input !== undefined) child.stdin?.end(input);
	});
