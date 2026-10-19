import { spawn } from 'node:child_process';

export interface Streamed {
	code: number | null;
	/** Only the end of both streams together, which is where a failure says what went wrong. */
	output: string;
}

/** `missing` when there is no such program. */
export class NotStarted extends Error {
	constructor(
		readonly missing: boolean,
		message: string,
	) {
		super(message);
		this.name = 'NotStarted';
	}
}

export class Stopped extends Error {
	constructor() {
		super('Stopped.');
		this.name = 'Stopped';
	}
}

export const runStreamed = (
	file: string,
	args: string[],
	{
		cwd,
		env = process.env,
		signal,
		onText = () => undefined,
	}: { cwd?: string; env?: NodeJS.ProcessEnv; signal?: AbortSignal; onText?: (text: string) => void },
): Promise<Streamed> =>
	new Promise((done, fail) => {
		const child = spawn(file, args, { cwd, env, shell: false, stdio: ['ignore', 'pipe', 'pipe'], ...(signal ? { signal } : {}) });
		let output = '';
		const read = (chunk: Buffer) => {
			const text = chunk.toString('utf8');
			output = (output + text).slice(-32_000);
			onText(text);
		};
		child.stdout.on('data', read);
		child.stderr.on('data', read);
		child.on('error', (err: NodeJS.ErrnoException) =>
			fail(signal?.aborted ? new Stopped() : new NotStarted(err.code === 'ENOENT', `Could not run ${file}: ${err.message}`)),
		);
		child.on('close', (code) => (signal?.aborted ? fail(new Stopped()) : done({ code, output })));
	});
