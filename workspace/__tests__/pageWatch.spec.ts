import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchPages } from '../extension/src/pageWatch';

/** Real files and the operating system's own word of a change; only the time a write must be still is made short. */
const SETTLE = 60;
const dirs: string[] = [];
const closers: (() => void)[] = [];
afterEach(() => {
	for (const close of closers.splice(0)) close();
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pages = async (files: Record<string, string> = {}) => {
	const dir = mkdtempSync(join(tmpdir(), 'dsnr-pages-'));
	dirs.push(dir);
	for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
	const told: string[] = [];
	const watching = watchPages(dir, (name) => void told.push(name), SETTLE);
	closers.push(watching.close);
	// The system tells of changes from a moment after a watch begins, as a tab's does: it opens long before a page is saved.
	await wait(150);
	return { dir, told, watching, write: (name: string, text: string) => writeFileSync(join(dir, name), text) };
};
/** Past the settle time, with room for the system to say: how long "nothing was said" is waited for. */
const settled = () => wait(SETTLE * 8);
/** What was told, once it has been, however late a loaded machine's system says it; then that nothing more follows. */
const toldAs = async (told: string[], want: string[]) => {
	await vi.waitFor(() => expect(told).toEqual(want), { timeout: 5000, interval: 20 });
	await settled();
	expect(told).toEqual(want);
};

// Each waits on the system's own word of a change, which a loaded machine can be slow to give: room for it, not a guess.
describe('watching a prototype’s pages for a save', { timeout: 20_000 }, () => {
	it('says a version’s page changed, once, after its writes have stopped: never of a page half written', async () => {
		const w = await pages({ 'v1.html': '<p>first</p>' });
		// Written slowly, in parts each sooner than the settle time after the last and lasting longer than it, as a large
		// page can be: a page told of before its last part would be a half-written one.
		w.write('v1.html', '<p>second');
		for (const part of [', and', ' the', ' rest</p>']) {
			await wait((SETTLE * 2) / 3);
			appendFileSync(join(w.dir, 'v1.html'), part);
		}
		await toldAs(w.told, ['v1']);
	});

	it('says again for each later change, and for the version it was', async () => {
		const w = await pages({ 'v1.html': '<p>1</p>', 'v2.html': '<p>2</p>' });
		w.write('v2.html', '<p>2, changed</p>');
		await toldAs(w.told, ['v2']);
		w.write('v1.html', '<p>1, changed</p>');
		await toldAs(w.told, ['v2', 'v1']);
		w.write('v2.html', '<p>2, changed again</p>');
		await toldAs(w.told, ['v2', 'v1', 'v2']);
	});

	it('says a version saved for the first time', async () => {
		const w = await pages();
		w.write('v1.html', '<p>new</p>');
		await toldAs(w.told, ['v1']);
	});

	it('says nothing for a page written as it was, or for what is not a version’s page', async () => {
		const w = await pages({ 'v1.html': '<p>same</p>' });
		w.write('v1.html', '<p>same</p>');
		w.write('v1.tsx', 'source');
		w.write('notes.html', '<p>x</p>');
		w.write('v1.html.bak', '<p>x</p>');
		await settled();
		expect(w.told).toEqual([]);
	});

	it('says nothing once closed, and a folder that is not there is nothing to watch', async () => {
		const w = await pages({ 'v1.html': '<p>1</p>' });
		w.watching.close();
		w.write('v1.html', '<p>changed</p>');
		await settled();
		expect(w.told).toEqual([]);
		const none = watchPages(join(tmpdir(), 'dsnr-pages-not-there'), () => undefined, SETTLE);
		expect(() => none.close()).not.toThrow();
	});
});
