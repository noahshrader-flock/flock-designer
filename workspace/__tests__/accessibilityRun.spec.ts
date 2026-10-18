import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckPage } from '../src/core/services/accessibility/accessibilityCheck';
import { FIRST_PAGE, checkPages, onDesignMode } from '../src/core/services/accessibility/accessibilityRun';
import { NO_BROWSER } from '../src/core/services/browser/chromeHeadless';
import type { WorkspaceCommand, WorkspaceDescriptor } from '../src/core/services/projects/descriptor';
import type { RuntimeDeps } from '../src/core/services/codebase/runtime';
import { undeclared } from '../src/shared/wcag';

/**
 * Measuring a product's own app (A2 of the accessibility plan): its pages checked one at a time, each a state of one
 * result, and the app started as its workspace file says, and stopped after.
 */

const rule = (id: string) => ({ id, help: id, impact: 'serious', tags: ['wcag2a'], helpUrl: '', nodes: 1, elements: [] });
const target = undeclared('Test has no .dsnr/manifest.md');

describe('checking the pages of an app', () => {
	const opened = async () => null;

	it('checks each page at its address on the app, as a state of one result, and says the one that did not open', async () => {
		const check = vi.fn<CheckPage>(async (url) => {
			if (url.endsWith('/settings')) throw new Error('The page did not load in its default state, so it could not be checked.\nmore');
			return [{ state: 'default', violations: url.includes('devices') ? [rule('image-alt')] : [], incomplete: [] }];
		});
		const progress = vi.fn();
		const { result, notOpened } = await checkPages({
			origin: 'http://localhost:3000/',
			pages: [FIRST_PAGE, { name: 'Devices', path: '/devices?tab=list' }, { name: 'Settings', path: '/settings' }],
			target,
			check,
			opens: opened,
			progress,
			now: () => new Date('2026-10-16T00:00:00Z'),
		});
		expect(check.mock.calls.map(([url, states, tags]) => [url, states, tags])).toEqual([
			['http://localhost:3000/', [], target.tags],
			['http://localhost:3000/devices?tab=list', [], target.tags],
			['http://localhost:3000/settings', [], target.tags],
		]);
		expect(result?.ran.states).toEqual(['default', 'Devices']);
		expect(result?.violations).toMatchObject([{ rule: 'image-alt', states: ['Devices'] }]);
		expect(notOpened).toEqual([
			{ name: 'Settings', path: '/settings', why: 'The page did not load in its default state, so it could not be checked.' },
		]);
		// Said as it goes, so a long run is never silent.
		expect(progress.mock.calls.map(([l]) => l)).toEqual([
			'Checking default (/)',
			'Checking Devices (/devices?tab=list)',
			'Checking Settings (/settings)',
		]);
	});

	it('checks nothing on a page that did not really open, and says why', async () => {
		const check = vi.fn<CheckPage>();
		const opens = vi.fn(async (url: string) => (url.endsWith('/') ? 'the page loaded, but the app drew nothing on it.' : null));
		const at = { origin: 'http://localhost:1/', pages: [FIRST_PAGE], target, check, opens, progress: () => undefined };
		expect(await checkPages(at)).toEqual({ result: null, notOpened: [{ ...FIRST_PAGE, why: 'the page loaded, but the app drew nothing on it.' }] });
		expect(opens).toHaveBeenCalledWith('http://localhost:1/');
		expect(check).not.toHaveBeenCalled();
	});

	it('has no result when no page opened, and stops at once when there is no browser to open one with', async () => {
		const none = await checkPages({
			origin: 'http://localhost:1/',
			pages: [FIRST_PAGE],
			target,
			check: () => Promise.reject(new Error('no')),
			opens: opened,
			progress: () => undefined,
		});
		expect(none).toEqual({ result: null, notOpened: [{ ...FIRST_PAGE, why: 'no' }] });
		const check = vi.fn<CheckPage>(() => Promise.reject(new Error(NO_BROWSER)));
		await expect(
			checkPages({ origin: 'http://localhost:1/', pages: [FIRST_PAGE, FIRST_PAGE], target, check, opens: opened, progress: () => undefined }),
		).rejects.toThrow(NO_BROWSER);
		expect(check).toHaveBeenCalledTimes(1);
	});
});

describe('the app, in design mode', () => {
	let root: string;
	const children: ChildProcess[] = [];
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'fdw-a11y-run-'));
	});
	afterEach(() => {
		for (const c of children.splice(0)) c.kill('SIGKILL');
		rmSync(root, { recursive: true, force: true });
	});

	const descriptorWith = (commands: WorkspaceCommand[]): WorkspaceDescriptor => ({
		version: 1,
		product: 'Plain Shop',
		contextDir: '.dsnr',
		branchPattern: { codebase: 'feature/<project-id>' },
		commands,
		designSystem: { package: 'x' },
	});
	const serving = (argv: string[]): WorkspaceCommand => ({ id: 'design-mode', label: 'Design mode', argv, servesPreviewOn: 4987 });
	const install: WorkspaceCommand = { id: 'install', label: 'Install packages', argv: ['npm', 'ci'] };
	const loads = async () => null;
	/** Spawns as the app does, and keeps each child, to see it stopped; the probe answers once `up` says. */
	const deps = (up: () => boolean): RuntimeDeps => ({
		spawnProcess: ((...a: Parameters<typeof spawn>) => {
			const child = spawn(...a);
			children.push(child);
			return child;
		}) as typeof spawn,
		probe: async () => up(),
		previewTimeoutMs: 3000,
	});

	it('says so, and runs nothing, when the product declares no design-mode command that serves a port', async () => {
		const work = vi.fn();
		for (const commands of [[], [{ id: 'design-mode', label: 'Design mode', argv: ['node'] }]]) {
			await expect(
				onDesignMode({ root, descriptor: descriptorWith(commands), projectId: 'p', loads, progress: () => undefined, deps: deps(() => true) }, work),
			).rejects.toThrow(
				`Plain Shop's .dsnr/workspace.json declares no "design-mode" command that serves its app on a port, so DSNR cannot open it, and nothing was measured.`,
			);
		}
		expect(work).not.toHaveBeenCalled();
	});

	it('starts it as its workspace file says, runs the work at its address, and stops it after', async () => {
		const descriptor = descriptorWith([serving(['node', '-e', 'setInterval(() => {}, 1000)'])]);
		const progress = vi.fn();
		const answered = await onDesignMode(
			{
				root,
				descriptor,
				projectId: 'p',
				loads: async (url) => (url.endsWith('/blank') ? 'the page loaded, but the app drew nothing on it.' : null),
				progress,
				deps: deps(() => children.length > 0),
			},
			async (origin, opens) => [origin, await opens(`${origin}fine`), await opens(`${origin}blank`)],
		);
		expect(answered).toEqual(['http://localhost:4987/', null, 'the page loaded, but the app drew nothing on it.']);
		expect(children).toHaveLength(1);
		expect(children[0]?.exitCode !== null || children[0]?.signalCode !== null).toBe(true);
		expect(progress).toHaveBeenCalledWith(`Starting Plain Shop's app (node -e setInterval(() => {}, 1000)), and waiting for it on port 4987`);
	});

	it('refuses a port something else already answers on, as it may not be this checkout’s app, and starts nothing', async () => {
		const descriptor = descriptorWith([serving(['node', '-e', 'setInterval(() => {}, 1000)'])]);
		const work = vi.fn();
		await expect(onDesignMode({ root, descriptor, projectId: 'p', loads, progress: () => undefined, deps: deps(() => true) }, work)).rejects.toThrow(
			"Something else is already answering on port 4987, where Plain Shop's app is served, so it may not be this checkout's, and nothing was measured. Stop it, then try again.",
		);
		expect(children).toHaveLength(0);
		expect(work).not.toHaveBeenCalled();
	});

	it('says why a page did not open from the server’s output, its build error, with a word on its packages', async () => {
		const failing =
			"console.log('\\u001b[31merror\\u001b[39m   Build error:'); console.log(\"  × export 'Card' (imported as 'Card') was not found in 'lib' (possible exports: A, B)\"); setInterval(() => {}, 1000)";
		const descriptor = descriptorWith([serving(['node', '-e', failing]), install]);
		let why: string | null = null;
		await onDesignMode(
			{
				root,
				descriptor,
				projectId: 'p',
				loads: async () => 'the page loaded, but the app drew nothing on it.',
				progress: () => undefined,
				deps: deps(() => children.length > 0),
			},
			async (_origin, opens) => {
				// Its output is read as it comes: given a moment to print what it prints as it starts.
				for (let i = 0; i < 40 && !why?.includes('Card'); i++) {
					why = await opens('http://localhost:4987/');
					await new Promise((r) => setTimeout(r, 50));
				}
			},
		);
		expect(why).toBe("export 'Card' (imported as 'Card') was not found in 'lib' Its packages may be out of date: npm ci");
	});

	it('takes a page that drew as opened, whatever the server printed before it did (a first compile that failed and was fixed)', async () => {
		const failing = "console.log('error   Build error:'); console.log(\"  × export 'Card' was not found in 'lib'\"); setInterval(() => {}, 1000)";
		const descriptor = descriptorWith([serving(['node', '-e', failing])]);
		const opened = await onDesignMode(
			{ root, descriptor, projectId: 'p', loads, progress: () => undefined, deps: deps(() => children.length > 0) },
			async (_origin, opens) => {
				await new Promise((r) => setTimeout(r, 300));
				return opens('http://localhost:4987/');
			},
		);
		expect(opened).toBeNull();
	});

	it('says why it did not start, with its last output, and runs nothing', async () => {
		const descriptor = descriptorWith([serving(['node', '-e', 'console.error("port 4987 is taken"); process.exit(2)'])]);
		const work = vi.fn();
		const failed = onDesignMode({ root, descriptor, projectId: 'p', loads, progress: () => undefined, deps: deps(() => false) }, work);
		await expect(failed).rejects.toThrow(
			/^Plain Shop's app did not start \(exited with code 2\), so nothing was measured\. Its last output:\nport 4987 is taken$/,
		);
		expect(work).not.toHaveBeenCalled();
	});
});
