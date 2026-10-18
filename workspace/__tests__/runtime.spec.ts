import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eventually, type Fn, nothingFollows } from './fixtures';
import { RuntimeManager, fillProjectId, type RuntimeDeps } from '../src/core/services/runtime';
import type { PreviewStatus, RunLogLine } from '../src/shared/contract';
import type { WorkspaceDescriptor } from '../src/core/services/descriptor';

const descriptor: WorkspaceDescriptor = {
	version: 1,
	product: 'Test',
	contextDir: '.dsnr',
	branchPattern: { codebase: 'feature/<project-id>' },
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

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), 'fdw-run-'));
	logs = [];
	statuses = [];
});

afterEach(async () => {
	await manager?.stopAll();
	rmSync(root, { recursive: true, force: true });
});

const make = (over: Partial<RuntimeDeps> = {}) => new RuntimeManager({ onLog: (l) => logs.push(l), onStatus: (s) => statuses.push(s) }, deps(over));

describe('the allowlist', () => {
	it('refuses a command the repository does not declare', async () => {
		manager = make();
		await expect(manager.start(root, descriptor, 'rm-rf')).rejects.toThrow(/not a command this repository declares/);
	});

	it('runs a declared command and reports its output', async () => {
		manager = make();
		await manager.start(root, descriptor, 'echo');
		await eventually(() => expect(logs.map((l) => l.text).join('')).toContain('hello from the command'));
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
		await nothingFollows();
		expect(existsSync(marker)).toBe(false);
	});
});

describe('process lifecycle', () => {
	it('reports a non-zero exit as failed, with the code', async () => {
		manager = make();
		await manager.start(root, descriptor, 'fail');
		await eventually(() => expect(statuses.some((s) => s.state === 'failed' && s.detail.includes('3'))).toBe(true));
	});

	it('reports a binary that does not exist rather than hanging', async () => {
		manager = make();
		await manager.start(root, descriptor, 'missing-binary');
		await eventually(() => expect(statuses.some((s) => s.state === 'failed')).toBe(true));
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
		expect(status).toEqual({ state: 'running', commandId: 'preview', url: 'http://localhost:4999/', projectId: null });
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
		await nothingFollows();
		expect(statuses.filter((s) => s.state === 'failed')).toEqual([]);
	});
});

describe('commands that serve one project', () => {
	it('puts the project in as its own argument', () => {
		expect(fillProjectId(['npm', 'run', 'start:prototype', '--', '<project-id>'], 'users-inactivity-signal')).toEqual([
			'npm',
			'run',
			'start:prototype',
			'--',
			'users-inactivity-signal',
		]);
	});

	it('leaves a command that names no project alone', () => {
		expect(fillProjectId(['npm', 'test'])).toEqual(['npm', 'test']);
	});

	it('refuses to run one that needs a project without being given one', () => {
		expect(() => fillProjectId(['npm', 'run', 'x', '<project-id>'])).toThrow(/needs a project/);
	});

	it.each(['a; rm -rf ~', '../../etc', '$(whoami)', 'Has Caps', ''])('refuses %j as a project', (bad) => {
		expect(() => fillProjectId(['x', '<project-id>'], bad)).toThrow();
	});
});

describe('one port, many prototypes', () => {
	// Every prototype is served on the same port by the same command, so the only
	// thing that says whose preview is running is the project it was started for.
	const proto: WorkspaceDescriptor = {
		...descriptor,
		commands: [
			{
				id: 'preview',
				label: 'Preview',
				argv: ['node', '-e', 'setInterval(() => {}, 1000)', '<project-id>'],
				servesPreviewOn: 4999,
			},
		],
	};

	it('says whose preview is running', async () => {
		manager = make();
		const s = await manager.start(root, proto, 'preview', 'alert-notification-prefs');
		expect(s).toMatchObject({ state: 'running', projectId: 'alert-notification-prefs' });
	});

	it('reuses the running preview for the same project, rather than starting a second', async () => {
		manager = make();
		const spawnSpy = vi.fn(spawn);
		manager = make({ spawnProcess: spawnSpy as unknown as typeof spawn });
		await manager.start(root, proto, 'preview', 'users-inactivity-signal');
		await manager.start(root, proto, 'preview', 'users-inactivity-signal');
		expect(spawnSpy).toHaveBeenCalledTimes(1);
	});

	it("replaces the running preview when a different project asks, instead of showing the first project's", async () => {
		const spawnSpy = vi.fn(spawn);
		manager = make({ spawnProcess: spawnSpy as unknown as typeof spawn });

		await manager.start(root, proto, 'preview', 'users-inactivity-signal');
		const second = await manager.start(root, proto, 'preview', 'alert-notification-prefs');

		// The bug this guards: the second call used to return the first project's
		// running status, so every piece of work opened showed the same prototype.
		expect(spawnSpy).toHaveBeenCalledTimes(2);
		expect(second).toMatchObject({ state: 'running', projectId: 'alert-notification-prefs' });
		expect(manager.status('preview')).toMatchObject({ projectId: 'alert-notification-prefs' });
	});

	it('hands the new project to the process it starts', async () => {
		const spawnSpy = vi.fn(spawn);
		manager = make({ spawnProcess: spawnSpy as unknown as typeof spawn });
		await manager.start(root, proto, 'preview', 'users-inactivity-signal');
		await manager.start(root, proto, 'preview', 'alert-notification-prefs');
		const argvs = spawnSpy.mock.calls.map((c) => (c[1] as string[]).at(-1));
		expect(argvs).toEqual(['users-inactivity-signal', 'alert-notification-prefs']);
	});
});

describe('a preview does not open a browser tab of its own', () => {
	const envOf = (spy: Fn) => (spy.mock.calls[0]?.[2] as { env: Record<string, string> }).env;

	it('tells a command that serves a preview not to open a browser, so DSNR is the only place it appears', async () => {
		const spawnSpy = vi.fn(spawn);
		manager = make({ spawnProcess: spawnSpy as unknown as typeof spawn });
		await manager.start(root, descriptor, 'preview');
		expect(envOf(spawnSpy)).toMatchObject({ CI: 'true', BROWSER: 'none' });
	});

	it('leaves the rest of the environment alone, so the command still finds its tools and credentials', async () => {
		const spawnSpy = vi.fn(spawn);
		manager = make({ spawnProcess: spawnSpy as unknown as typeof spawn });
		await manager.start(root, descriptor, 'preview');
		expect(envOf(spawnSpy).PATH).toBe(process.env.PATH);
	});

	it('does not touch the environment of an ordinary command, such as the tests or the linter', async () => {
		const spawnSpy = vi.fn(spawn);
		manager = make({ spawnProcess: spawnSpy as unknown as typeof spawn });
		await manager.start(root, descriptor, 'echo');
		expect(envOf(spawnSpy)).toBe(process.env);
	});
});
