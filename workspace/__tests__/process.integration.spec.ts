import { describe, expect, it } from 'vitest';
import { NotInstalled, ProcessFailed, runFile } from '../src/main/services/process';

const node = process.execPath;

describe('running a program', () => {
	it('answers for a program that exits without reading its input, rather than crashing on the closed pipe (EPIPE)', async () => {
		// Far more than a pipe holds, to a program that never reads it: the write fails after the program is gone.
		const r = await runFile(node, ['-e', 'process.exit(0)'], { input: 'x'.repeat(4 * 1024 * 1024) });
		expect(r.stdout).toBe('');
		const failed = await runFile(node, ['-e', 'process.exit(2)'], { input: 'x'.repeat(4 * 1024 * 1024) }).catch((e: unknown) => e);
		expect(failed).toBeInstanceOf(ProcessFailed);
	});

	it('answers with what it printed, and its input given all at once', async () => {
		const r = await runFile(node, ['-e', 'process.stdin.on("data", (d) => process.stdout.write(d.toString().toUpperCase()))'], { input: 'hi' });
		expect(r).toEqual({ stdout: 'HI', stderr: '' });
	});

	it('fails with what it said when it exits with an error, keeping what it printed', async () => {
		const failed = await runFile(node, ['-e', 'console.log("half"); console.error("it broke"); process.exit(3)']).catch((e: unknown) => e);
		expect(failed).toBeInstanceOf(ProcessFailed);
		expect(failed).toMatchObject({ message: 'it broke', stdout: 'half\n', stderr: 'it broke\n', code: 3, timedOut: false });
	});

	it('is stopped, and says so, when it runs past its time', async () => {
		const started = Date.now();
		const failed = await runFile(node, ['-e', 'setTimeout(() => {}, 60000)'], { timeoutMs: 300 }).catch((e: unknown) => e);
		expect(failed).toBeInstanceOf(ProcessFailed);
		expect(failed).toMatchObject({ timedOut: true });
		expect((failed as Error).message).toMatch(/did not finish within 0\.3 s/);
		expect(Date.now() - started).toBeLessThan(5000);
	});

	it('says a program is not installed, rather than failing with a code', async () => {
		const failed = await runFile('definitely-not-installed-xyz', []).catch((e: unknown) => e);
		expect(failed).toBeInstanceOf(NotInstalled);
		expect(failed).toMatchObject({ code: 'ENOENT', program: 'definitely-not-installed-xyz' });
	});
});
