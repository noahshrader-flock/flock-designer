import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentRunner } from '../src/main/services/agent';
import { buildContextReceipt } from '../src/main/services/contextReceipt';
import { readDescriptor } from '../src/main/services/descriptor';
import { readCheckout } from '../src/main/services/git';
import { continueIteration, createIteration, readIterations } from '../src/main/services/iterations';
import { RuntimeManager } from '../src/main/services/runtime';
import { OpenedCheckouts } from '../src/main/services/session';
import type { PreviewStatus, RunLogLine } from '../src/shared/contract';
import { agentFinished } from './fixtures';

/**
 * The journey step 13 owes, start to finish.
 *
 * Every piece has its own tests. This is the one that answers the "done when":
 * a request becomes a repo-backed preview without anyone touching git or a dev
 * server by hand. It runs the same services the IPC handlers call, against a
 * real repository on disk, so a break in the seams between them fails here.
 */

let product: string;
let records: string;
const g = (...args: string[]) => execFileSync('git', ['-C', product, ...args], { encoding: 'utf8' });

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
			branchPattern: { prototype: 'fd/<project-id>/i<n>', codebase: 'feature/<project-id>' },
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

	g('init', '-q', '-b', 'develop');
	g('add', '.');
	g('commit', '-q', '-m', 'baseline');
});

afterEach(() => {
	rmSync(product, { recursive: true, force: true });
	rmSync(records, { recursive: true, force: true });
});

describe('from a request to a running preview', () => {
	it('runs the whole journey without the designer touching git or a dev server', async () => {
		// 1. Open the repository. Nothing else is reachable until this happens.
		const opened = new OpenedCheckouts();
		const root = opened.remember(product);
		const checkout = await readCheckout(root);
		expect(checkout.branch).toBe('develop');
		expect(checkout.clean).toBe(true);

		// 2. See what was grounded, BEFORE anything is generated.
		const descriptor = readDescriptor(root);
		const receipt = await buildContextReceipt(root, descriptor);
		expect(receipt.product).toBe('Test Product');
		expect(receipt.designSystem.resolved).toBe('5.5.4');
		expect(receipt.contextFiles).toContain('.dsnr/non-negotiables.md');
		expect(receipt.problems).toEqual([]);

		// 3. Start the codebase work. The branch is made for them.
		const work = await createIteration(root, records, descriptor, 'inactive-users', 'first try', 'develop');
		expect(work.branch).toBe('feature/inactive-users');
		expect((await readCheckout(root)).branch).toBe('feature/inactive-users');

		// 4. Hand the task to the agent. Substituted here so the journey does not
		//    depend on Claude Code being installed; the adapter boundary is the point.
		const logs: RunLogLine[] = [];
		const agent = new AgentRunner((l) => logs.push(l), {
			spawnProcess: spawn,
			adapter: { name: 'Stub', argvFor: (t) => ['node', '-e', `console.log(${JSON.stringify(t)})`] },
		});
		agent.start(root, 'inactive-users', 'Flag users who have not signed in for 90 days.');
		await new Promise((r) => setTimeout(r, 400));
		expect(logs.map((l) => l.text).join('')).toContain('Project: inactive-users');
		expect(agent.status()).toEqual(agentFinished());

		// 5. The agent's work lands on the branch and is committed.
		writeFileSync(join(product, 'src/prototypes/view.tsx'), 'export const View = () => null;\n');
		g('add', '.');
		g('commit', '-q', '-m', 'prototype');

		// 6. Run the preview. The designer names no command; the repository declared it.
		const statuses: PreviewStatus[] = [];
		const runtime = new RuntimeManager(
			{ onLog: (l) => logs.push(l), onStatus: (s) => statuses.push(s) },
			{ spawnProcess: spawn, probe: async () => true, previewTimeoutMs: 3000 },
		);
		const preview = await runtime.start(root, descriptor, 'preview');
		expect(preview).toEqual({ state: 'running', commandId: 'preview', url: 'http://localhost:4998/', projectId: null });

		// 7. Stop it, and leave nothing running.
		await runtime.stop('preview');
		expect(runtime.status('preview')).toEqual({ state: 'stopped' });
		runtime.stopAll();

		// 8. The record survives leaving the branch, because it never lived on it.
		g('checkout', '-q', 'develop');
		expect(readIterations(records, 'inactive-users').map((i) => i.name)).toEqual(['codebase']);

		// 9. Come back to it later and the commit is recorded.
		const back = await continueIteration(root, records, 'inactive-users', 'codebase', null, readDescriptor(root));
		expect(back.commit).toMatch(/^[0-9a-f]{40}$/);
		expect((await readCheckout(root)).branch).toBe('feature/inactive-users');
	});

	it('stops at the first real problem rather than half-doing the journey', async () => {
		const opened = new OpenedCheckouts();
		const root = opened.remember(product);
		const descriptor = readDescriptor(root);

		// An uncommitted edit must block the branch move, not be carried across.
		writeFileSync(join(product, 'src/prototypes/scratch.txt'), 'unsaved thinking\n');
		await expect(createIteration(root, records, descriptor, 'inactive-users', 'x', 'develop')).rejects.toThrow(/uncommitted changes/);

		expect(readIterations(records, 'inactive-users')).toEqual([]);
		expect((await readCheckout(root)).branch).toBe('develop');

		// And the receipt says so in the designer's words, rather than the app
		// discovering it only when the branch move fails.
		const receipt = await buildContextReceipt(root, descriptor);
		expect(receipt.problems.join(' ')).toMatch(/uncommitted changes/);
	});

	it('refuses a repository the designer never opened', () => {
		const opened = new OpenedCheckouts();
		expect(() => opened.require(product)).toThrow(/not open in this window/);
	});
});
