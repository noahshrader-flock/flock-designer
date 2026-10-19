import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { receivePage } from '../extension/src/bridge';
import { agentWork } from '../extension/src/agentWork';

/**
 * What any DSNR page sends (`receivePage`), the panel or a design system's tab: that it listens, a call to the core, or an
 * ask of the extension's, each answered by its id, and a failed ask said. Then the agent at work, as every flow has it,
 * and the manifest and the code agreeing on the commands.
 */

const page = () => {
	const webview = { postMessage: vi.fn(async () => true) };
	const panels = { ready: vi.fn(async () => undefined) };
	const failed = vi.fn();
	const opened = vi.fn(async (_file: string) => undefined);
	const asks = new Map([
		[
			'openComponent',
			async (...args: unknown[]) =>
				typeof args[0] === 'string' ? (await opened(args[0]), { ok: true, value: null }) : { ok: false, error: 'That is not a file.' },
		],
	]) as never;
	const said = (raw: unknown) => receivePage(panels, webview as never, raw, asks, failed);
	return { webview, panels, failed, opened, said };
};

describe('what any DSNR page sends', () => {
	it('says it listens, and is told every value pages share', async () => {
		const p = page();
		await p.said({ type: 'ready' });
		expect(p.panels.ready).toHaveBeenCalledWith(p.webview);
	});

	it('answers a call to the core by its id, with the core’s own result', async () => {
		const p = page();
		await p.said({ type: 'call', id: 7, name: 'signInState', args: [] });
		expect(p.webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'answer', id: 7 }));
	});

	it('answers an ask from the extension’s own table, and says one refused, as the extension says what goes wrong', async () => {
		const p = page();
		await p.said({ type: 'call', id: 3, name: 'openComponent', args: ['a.stories.tsx'] });
		expect(p.opened).toHaveBeenCalledWith('a.stories.tsx');
		expect(p.webview.postMessage).toHaveBeenLastCalledWith({ type: 'answer', id: 3, result: { ok: true, value: null } });
		await p.said({ type: 'call', id: 4, name: 'openComponent', args: [3] });
		expect(p.failed).toHaveBeenCalledWith(new Error('That is not a file.'));
		expect(p.webview.postMessage).toHaveBeenLastCalledWith({ type: 'answer', id: 4, result: { ok: false, error: 'That is not a file.' } });
	});

	it('drops anything else, answering nothing', async () => {
		const p = page();
		for (const raw of [{ type: 'open-component', id: 'a' }, { type: 'call', id: 1, name: 'runAnything', args: [] }, null]) await p.said(raw);
		expect(p.webview.postMessage).not.toHaveBeenCalled();
		expect(p.panels.ready).not.toHaveBeenCalled();
	});
});

describe('the agent at work, as every flow has it', () => {
	const world = () => {
		const lines: ((l: { text: string }) => void)[] = [];
		const stopped = vi.fn();
		return {
			api: {
				agentReadiness: vi.fn(),
				stopAgent: vi.fn(async () => ({ ok: true, value: null })),
				onAgentLog: vi.fn((l: (line: { text: string }) => void) => (lines.push(l), stopped)),
			},
			log: { start: vi.fn(), line: vi.fn() },
			lines,
			stopped,
		};
	};

	it('starts its log afresh, feeds it each line as it comes, and stops listening once the work is done', async () => {
		const w = world();
		const progress = vi.fn(async (_title: string, task: (say: (m: string) => void) => Promise<void>) => task(() => undefined));
		const { stopped } = await agentWork({ ...w, progress } as never, { title: 'Building X', logTitle: 'X' }, async () => {
			w.lines[0]?.({ text: 'Reading the brief\n' });
		});
		expect(stopped).toBe(false);
		expect(w.log.start).toHaveBeenCalledWith('X');
		expect(w.log.line).toHaveBeenCalledWith('Reading the brief');
		expect(progress).toHaveBeenCalledWith('Building X', expect.any(Function), expect.any(Function));
		expect(w.stopped).toHaveBeenCalled();
	});

	it('stops the agent when Stop is pressed, which ends the core’s job, and says it was stopped', async () => {
		const w = world();
		const progress = vi.fn(async (_title: string, task: (say: (m: string) => void) => Promise<void>, onStop?: () => void) => {
			onStop?.();
			await task(() => undefined);
		});
		const { stopped } = await agentWork({ ...w, progress } as never, { title: 't', logTitle: 't' }, async () => undefined);
		expect(stopped).toBe(true);
		expect(w.api.stopAgent).toHaveBeenCalled();
		expect(w.stopped).toHaveBeenCalled();
	});
});

describe('the commands', () => {
	it('are the same in the manifest and in the code: each declared one is registered, and each registered one declared', () => {
		const dir = join(__dirname, '../extension/src');
		const registered = new Set(
			readdirSync(dir)
				.filter((f) => f.endsWith('.ts'))
				.flatMap((f) => [...readFileSync(join(dir, f), 'utf8').matchAll(/registerCommand\(\s*'(dsnr\.[A-Za-z]+)'/g)].map((m) => m[1] as string)),
		);
		const manifest = JSON.parse(readFileSync(join(__dirname, '../extension/package.json'), 'utf8')) as {
			contributes: { commands: { command: string }[] };
		};
		// `dsnr.open` and `dsnr.getStarted` too: every one a person can run is the manifest's, and nothing else is registered.
		expect([...registered].sort()).toEqual(manifest.contributes.commands.map((c) => c.command).sort());
	});
});
