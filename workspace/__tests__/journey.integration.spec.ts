import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentRunner } from '../src/core/services/agent/agent';
import { readDescriptor } from '../src/core/services/projects/descriptor';
import { readCheckout } from '../src/core/services/platform/git';
import { continueWork, createCodebaseWork, readWork } from '../src/core/services/projects/workRecords';
import { RuntimeManager } from '../src/core/services/codebase/runtime';
import { OpenedCheckouts } from '../src/core/services/projects/session';
import type { PreviewStatus, RunLogLine } from '../src/shared/contract';
import { g, agentFinished, eventually } from './fixtures';

/**
 * Every piece has its own tests; this runs the same services the IPC handlers call, against a real repository on disk,
 * so a break in the seams between them fails here.
 */

let product: string;
let records: string;

beforeEach(() => {
	product = mkdtempSync(join(tmpdir(), 'fdw-journey-'));
	records = mkdtempSync(join(tmpdir(), 'fdw-journey-records-'));

	mkdirSync(join(product, '.dsnr'), { recursive: true });
	mkdirSync(join(product, 'src/prototypes'), { recursive: true });
	writeFileSync(join(product, '.dsnr/non-negotiables.md'), '# rules\n');
	writeFileSync(
		join(product, '.dsnr/workspace.json'),
		JSON.stringify({
			version: 1,
			product: 'Test Product',
			contextDir: '.dsnr',
			prototypeRoot: 'src/prototypes',
			branchPattern: { codebase: 'feature/<project-id>' },
			commands: [
				{
					id: 'preview',
					label: 'Run the prototype',
					argv: ['node', '-e', 'setInterval(() => {}, 1000)'],
					servesPreviewOn: 4998,
				},
			],
			designSystem: { package: '@flocksafety/flock-react-component-lib' },
		}),
	);
	writeFileSync(
		join(product, 'package-lock.json'),
		JSON.stringify({ packages: { 'node_modules/@flocksafety/flock-react-component-lib': { version: '5.5.4' } } }),
	);

	g(product, 'init', '-q', '-b', 'develop');
	g(product, 'add', '.');
	g(product, 'commit', '-q', '-m', 'baseline');
});

afterEach(() => {
	rmSync(product, { recursive: true, force: true });
	rmSync(records, { recursive: true, force: true });
});

describe('from a request to a running preview', () => {
	it('runs the whole journey without the designer touching git or a dev server', async () => {
		const opened = new OpenedCheckouts();
		const root = opened.remember(product);
		const checkout = await readCheckout(root);
		expect(checkout.branch).toBe('develop');
		expect(checkout.clean).toBe(true);

		const descriptor = readDescriptor(root);
		expect(descriptor.product).toBe('Test Product');

		const work = await createCodebaseWork(root, records, descriptor, 'inactive-users', 'first try', 'develop');
		expect(work.branch).toBe('feature/inactive-users');
		expect((await readCheckout(root)).branch).toBe('feature/inactive-users');

		// The agent is substituted so the journey does not depend on Claude Code being installed.
		const logs: RunLogLine[] = [];
		const agent = new AgentRunner((l) => logs.push(l), {
			spawnProcess: spawn,
			adapter: { name: 'Stub', argvFor: (t) => ['node', '-e', `console.log(${JSON.stringify(t)})`] },
		});
		agent.start(root, 'inactive-users', 'Flag users who have not signed in for 90 days.');
		await eventually(() => expect(agent.status()).toEqual(agentFinished()));
		expect(logs.map((l) => l.text).join('')).toContain('Project: inactive-users');

		writeFileSync(join(product, 'src/prototypes/view.tsx'), 'export const View = () => null;\n');
		g(product, 'add', '.');
		g(product, 'commit', '-q', '-m', 'prototype');

		const statuses: PreviewStatus[] = [];
		const runtime = new RuntimeManager(
			{ onLog: (l) => logs.push(l), onStatus: (s) => statuses.push(s) },
			{ spawnProcess: spawn, probe: async () => true, previewTimeoutMs: 3000 },
		);
		const preview = await runtime.start(root, descriptor, 'preview');
		expect(preview).toEqual({ state: 'running', commandId: 'preview', url: 'http://localhost:4998/', projectId: null });

		await runtime.stop('preview');
		expect(runtime.status('preview')).toEqual({ state: 'stopped' });
		await runtime.stopAll();

		// The record survives leaving the branch, because it never lived on it.
		g(product, 'checkout', '-q', 'develop');
		expect(readWork(records, 'inactive-users').map((i) => i.name)).toEqual(['codebase']);

		const back = await continueWork(root, records, 'inactive-users', 'codebase', null, readDescriptor(root));
		expect(back.commit).toMatch(/^[0-9a-f]{40}$/);
		expect((await readCheckout(root)).branch).toBe('feature/inactive-users');
	});

	it('stops at the first real problem rather than half-doing the journey', async () => {
		const opened = new OpenedCheckouts();
		const root = opened.remember(product);
		const descriptor = readDescriptor(root);

		// An uncommitted edit must block the branch move, not be carried across.
		writeFileSync(join(product, 'src/prototypes/scratch.txt'), 'unsaved thinking\n');
		await expect(createCodebaseWork(root, records, descriptor, 'inactive-users', 'x', 'develop')).rejects.toThrow(/uncommitted changes/);

		expect(readWork(records, 'inactive-users')).toEqual([]);
		expect((await readCheckout(root)).branch).toBe('develop');
	});

	it('refuses a repository the designer never opened', () => {
		const opened = new OpenedCheckouts();
		expect(() => opened.require(product)).toThrow(/not open in this window/);
	});
});
