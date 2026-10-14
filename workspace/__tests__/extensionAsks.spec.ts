import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { type DesignSystemAsks, answerPage } from '../extension/src/bridge';
import { agentWork } from '../extension/src/agentWork';
import type { PanelMessage } from '../extension/src/messages';

/**
 * What any DSNR page may ask (`answerPage`), the panel or a design system's tab: a call to the core, answered by its id,
 * and the design system's asks, each to its own; the rest is the panel's alone. Then the agent at work, as every flow has
 * it, and the manifest and the code agreeing on the commands.
 */

const asks = (): DesignSystemAsks & Record<string, ReturnType<typeof vi.fn>> =>
	({
		openComponent: vi.fn(async () => undefined),
		componentLink: vi.fn(async () => undefined),
		openPrimitives: vi.fn(async () => undefined),
		openVoiceAndTone: vi.fn(async () => undefined),
		openTokenSource: vi.fn(async () => undefined),
		edits: vi.fn(() => []),
		setEdits: vi.fn(),
	}) as never;

describe('what any DSNR page may ask', () => {
	it('is each design system ask, given to its own, and said to be answered', async () => {
		const a = asks();
		const webview = { postMessage: vi.fn(async () => true) };
		const cases: [PanelMessage, string, unknown[]][] = [
			[{ type: 'open-component', id: 'a.stories.tsx' }, 'openComponent', ['a.stories.tsx']],
			[{ type: 'component-link', id: 'a.stories.tsx', link: 'source' }, 'componentLink', ['a.stories.tsx', 'source']],
			[{ type: 'open-primitives' }, 'openPrimitives', []],
			[{ type: 'open-voice-and-tone' }, 'openVoiceAndTone', []],
			[{ type: 'open-token-source', file: 'a.ts', line: 3 }, 'openTokenSource', ['a.ts', 3]],
			[{ type: 'token-edits', edits: [] }, 'setEdits', [[]]],
		];
		for (const [message, ask, args] of cases) {
			expect(await answerPage(webview as never, message, a), message.type).toBe(true);
			expect(a[ask]).toHaveBeenLastCalledWith(...args);
		}
		expect(webview.postMessage).not.toHaveBeenCalled();
	});

	it('answers a call to the core by its id, with the core’s own result', async () => {
		const webview = { postMessage: vi.fn(async () => true) };
		expect(await answerPage(webview as never, { type: 'call', id: 7, name: 'signInState', args: [] }, asks())).toBe(true);
		expect(webview.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'answer', id: 7 }));
	});

	it('leaves the panel’s own asks to the panel', async () => {
		for (const message of [{ type: 'ready' }, { type: 'locate-design-system' }, { type: 'ask-new-prototype' }] as PanelMessage[])
			expect(await answerPage({ postMessage: vi.fn() } as never, message, asks()), message.type).toBe(false);
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

	it('stops the agent when Stop is pressed, tells the work it is no longer live, and says it was stopped', async () => {
		const w = world();
		let live: boolean | null = null;
		const progress = vi.fn(async (_title: string, task: (say: (m: string) => void) => Promise<void>, onStop?: () => void) => {
			onStop?.();
			await task(() => undefined);
		});
		const { stopped } = await agentWork({ ...w, progress } as never, { title: 't', logTitle: 't' }, async (_say, isLive) => {
			live = isLive();
		});
		expect(stopped).toBe(true);
		expect(live).toBe(false);
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
