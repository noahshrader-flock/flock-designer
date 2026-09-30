import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeManager, type RuntimeDeps } from '../src/main/services/runtime';
import type { PreviewStatus, RunLogLine, WorkspaceDescriptor } from '../src/shared/contract';

const descriptor: WorkspaceDescriptor = {
	version: 1,
	product: 'Test',
	contextDir: '.flkd',
	prototypeRoot: 'src/prototypes',
	branchPattern: { prototype: 'fd/<project-id>/i<n>', codebase: 'feature/<project-id>' },
	commands: [
		{ id: 'echo', label: 'Echo', argv: ['node', '-e', 'console.log("hello from the command")'] },
		{ id: 'fail', label: 'Fail', argv: ['node', '-e', 'process.exit(3)'] },
		{ id: 'preview', label: 'Preview', argv: ['node', '-e', 'setInterval(() => {}, 1000)'], servesPreviewOn: 4999 },
		{ id: 'missing-binary', label: 'Missing', argv: ['definitely-not-a-real-binary-xyz'] },
	],
	designSystem: { package: '@flocksafety/flock-react-component-lib' },
};

let root: string;
let logs: RunLogLine[];
let statuses: PreviewStatus[];
let manager: RuntimeManager;

const deps = (over: Partial<RuntimeDeps> = {}): RuntimeDeps => ({
	spawnProcess: spawn,
	probe: async () => true,
	previewTimeoutMs: 2000,
	...over,
});

const settle = () => new Promise((r) => setTimeout(r, 300));

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'fdw-run-'));
	logs = [];
	statuses = [];
});

afterEach(() => {
	manager?.stopAll();
	rmSync(root, { recursive: true, force: true });
});

const make = (over: Partial<RuntimeDeps> = {}) =>
	new RuntimeManager({ onLog: (l) => logs.push(l), onStatus: (s) => statuses.push(s) }, deps(over));

describe('the allowlist', () => {
	it('refuses a command the repository does not declare', async () => {
		manager = make();
		await expect(manager.start(root, descriptor, 'rm-rf')).rejects.toThrow(/not a command this repository declares/);
	});

	it('runs a declared command and reports its output', async () => {
		manager = make();
		await manager.start(root, descriptor, 'echo');
		await settle();
		expect(logs.map((l) => l.text).join('')).toContain('hello from the command');
	});

	it('cannot be given a shell string, because there is no shell', async () => {
		// spawn with shell:false means `;` and `&&` are arguments, not syntax.
		const marker = join(root, 'pwned');
		const sneaky: WorkspaceDescriptor = {
			...descriptor,
			commands: [{ id: 'x', label: 'x', argv: ['node', '-e', 'console.log(1)', ';', `touch ${marker}`] }],
		};
		manager = make();
		await manager.start(root, sneaky, 'x');
		await settle();
		expect(existsSync(marker)).toBe(false);
	});
});

describe('process lifecycle', () => {
	it('reports a non-zero exit as failed, with the code', async () => {
		manager = make();
		await manager.start(root, descriptor, 'fail');
		await settle();
		expect(statuses.some((s) => s.state === 'failed' && s.detail.includes('3'))).toBe(true);
	});

	it('reports a binary that does not exist rather than hanging', async () => {
		manager = make();
		await manager.start(root, descriptor, 'missing-binary');
		await settle();
		expect(statuses.some((s) => s.state === 'failed')).toBe(true);
	});

	it('does not start the same command twice', async () => {
		manager = make({ probe: async () => true });
		const first = await manager.start(root, descriptor, 'preview');
		const second = await manager.start(root, descriptor, 'preview');
		expect(second).toEqual(first);
	});
});

describe('preview', () => {
	it('reports running with a URL once the port answers', async () => {
		manager = make({ probe: async () => true });
		const status = await manager.start(root, descriptor, 'preview');
		expect(status).toEqual({ state: 'running', commandId: 'preview', url: 'http://localhost:4999/' });
	});

	it('gives up with a readable reason when the port never answers', async () => {
		manager = make({ probe: async () => false, previewTimeoutMs: 600 });
		const status = await manager.start(root, descriptor, 'preview');
		expect(status.state).toBe('failed');
		expect(status.state === 'failed' && status.detail).toMatch(/did not answer on port 4999/);
	});

	it('stops a running preview', async () => {
		manager = make({ probe: async () => true });
		await manager.start(root, descriptor, 'preview');
		expect(await manager.stop('preview')).toEqual({ state: 'stopped' });
		expect(manager.status('preview')).toEqual({ state: 'stopped' });
	});

	it('is stopped when nothing is running', async () => {
		manager = make();
		expect(manager.status('preview')).toEqual({ state: 'stopped' });
		expect(await manager.stop('preview')).toEqual({ state: 'stopped' });
	});

	it('does not report failure for a preview the designer stopped', async () => {
		manager = make({ probe: async () => true });
		await manager.start(root, descriptor, 'preview');
		await manager.stop('preview');
		await settle();
		expect(statuses.filter((s) => s.state === 'failed')).toEqual([]);
	});
});
