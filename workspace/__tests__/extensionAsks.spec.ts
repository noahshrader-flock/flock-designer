import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { receivePage } from '../extension/src/bridge';

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

describe('the commands', () => {
	it('are the same in the manifest and in the code: each declared one is registered, and each registered one declared', () => {
		const dir = join(__dirname, '../extension/src');
		const registered = new Set(
			readdirSync(dir)
				.filter((f) => f.endsWith('.ts'))
				.flatMap((f) =>
					[...readFileSync(join(dir, f), 'utf8').matchAll(/(?:registerCommand\(\s*|^\t\t)'(dsnr\.[A-Za-z]+)'/gm)].map((m) => m[1] as string),
				),
		);
		const manifest = JSON.parse(readFileSync(join(__dirname, '../extension/package.json'), 'utf8')) as {
			contributes: { commands: { command: string }[] };
		};
		expect([...registered].sort()).toEqual(manifest.contributes.commands.map((c) => c.command).sort());
	});
});
