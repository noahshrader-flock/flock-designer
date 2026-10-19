import { act, createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useWorkspace } from '../extension/webview/hooks/useWorkspace';
import type { Result } from '../src/shared/contract';
import { fail, ok, render, settle, unmountAll } from './reviewHarness';

/**
 * One way for a screen to read something from the app: what it read, why it could not, whether it is still reading, and
 * a way to read it again; an answer that comes back after the screen asked for something else is dropped.
 */

type Seen = ReturnType<typeof useWorkspace<string>>;
let current: Awaited<ReturnType<typeof render>> | null = null;
let seen: Seen | null = null;
const Probe = ({ read, dep, enabled }: { read: () => Promise<Result<string>>; dep: string; enabled: boolean }) => {
	seen = useWorkspace(read, [dep], { enabled });
	return null;
};
const show = async (read: () => Promise<Result<string>>, dep = 'a', enabled = true) => {
	// Inside the same wrapper the harness renders in, so it is the same component that is told, not a new one.
	if (current) await act(async () => current!.root.render(createElement(Probe, { read, dep, enabled })));
	else current = await render(createElement(Probe, { read, dep, enabled }));
	await settle();
};
afterEach(async () => {
	if (current) await unmountAll(current.root);
	current = null;
	seen = null;
});

describe('reading from the app', () => {
	it('is loading until it answers, then has the value', async () => {
		let answer: (r: Result<string>) => void = () => undefined;
		current = await render(createElement(Probe, { read: () => new Promise<Result<string>>((r) => (answer = r)), dep: 'a', enabled: true }));
		expect(seen).toMatchObject({ value: null, error: null, loading: true });
		await act(async () => answer(ok('one')));
		expect(seen).toMatchObject({ value: 'one', error: null, loading: false });
	});

	it('says why it could not, rather than dropping it', async () => {
		await show(async () => fail('Could not reach GitHub.'));
		expect(seen).toMatchObject({ value: null, error: 'Could not reach GitHub.', loading: false });
	});

	it('reads nothing while it is not enabled', async () => {
		let asked = 0;
		await show(async () => (asked++, ok('x')), 'a', false);
		expect(asked).toBe(0);
		expect(seen).toMatchObject({ value: null, loading: false });
	});

	it('drops an answer that comes back after it asked for something else', async () => {
		const answers: Record<string, (r: Result<string>) => void> = {};
		const read = (dep: string) => () => new Promise<Result<string>>((r) => (answers[dep] = r));
		await show(read('a'), 'a');
		await show(read('b'), 'b');
		await act(async () => answers.b!(ok('for b')));
		await act(async () => answers.a!(ok('for a')));
		// Long enough for the late answer to land, had it been kept.
		await settle();
		expect(seen?.value).toBe('for b');
	});

	it('forgets what it read for something else, and keeps it while the same is read again', async () => {
		let n = 0;
		await show(async () => ok(`a${++n}`), 'a');
		expect(seen?.value).toBe('a1');
		let hold: (r: Result<string>) => void = () => undefined;
		await show(() => new Promise((r) => (hold = r)), 'b');
		expect(seen?.value).toBeNull();
		await act(async () => hold(ok('b1')));
		await show(() => new Promise((r) => (hold = r)), 'b');
		await act(async () => seen!.reload());
		expect(seen).toMatchObject({ value: 'b1', loading: true });
	});
});
