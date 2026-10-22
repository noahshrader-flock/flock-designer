import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RuntimeManager } from '../src/core/services/codebase/runtime';
import type { WorkspaceDescriptor } from '../src/core/services/products/descriptor';

let root: string;
let left: number | null = null;
beforeEach(() => void (root = mkdtempSync(join(tmpdir(), 'dsnr-runtime-stop-'))));
afterEach(() => {
	if (left !== null) {
		try {
			process.kill(left, 'SIGKILL');
		} catch {
			// Gone already.
		}
	}
	rmSync(root, { recursive: true, force: true });
});

const alive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

it('leaves no child of a stopped dev server running, though neither it nor its parent takes SIGTERM', async () => {
	writeFileSync(
		join(root, 'server.js'),
		`process.on('SIGTERM', () => {}); require('fs').writeFileSync(${JSON.stringify(join(root, 'pid'))}, String(process.pid)); setInterval(() => {}, 1000);`,
	);
	writeFileSync(
		join(root, 'parent.js'),
		`process.on('SIGTERM', () => {}); require('child_process').spawn(process.execPath, [${JSON.stringify(join(root, 'server.js'))}], { stdio: 'ignore' }); setInterval(() => {}, 1000);`,
	);
	const descriptor: WorkspaceDescriptor = {
		version: 1,
		product: 'Test',
		contextDir: '.dsnr',
		branchPattern: { codebase: 'feature/<prototype-id>' },
		commands: [{ id: 'dev', label: 'Dev', argv: [process.execPath, join(root, 'parent.js')] }],
		designSystem: { package: 'x' },
	};
	const runtime = new RuntimeManager(
		{ onLog: () => {}, onStatus: () => {} },
		{ spawnProcess: spawn, probe: async () => true, previewTimeoutMs: 2000 },
	);
	await runtime.start(root, descriptor, 'dev');
	const server = await vi.waitFor(
		() => {
			const pid = Number(readFileSync(join(root, 'pid'), 'utf8'));
			expect(pid).toBeGreaterThan(0);
			return pid;
		},
		{ timeout: 5000 },
	);
	left = server;
	await runtime.stop('dev');
	await new Promise((r) => setTimeout(r, 500));
	expect(alive(server)).toBe(false);
}, 30_000);
