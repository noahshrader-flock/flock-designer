import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { watchPages } from '../extension/src/pageWatch';

/** Real files and the operating system's own word of a change; only the time a write must be still is made short. */
const SETTLE = 60;
const dirs: string[] = [];
const closers: (() => void)[] = [];
afterEach(() => {
	for (const close of closers.splice(0)) close();
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const pages = (files: Record<string, string> = {}) => {
	const dir = mkdtempSync(join(tmpdir(), 'dsnr-pages-'));
	dirs.push(dir);
	for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
	const told: string[] = [];
	const watching = watchPages(dir, (name) => void told.push(name), SETTLE);
	closers.push(watching.close);
	return { dir, told, watching, write: (name: string, text: string) => writeFileSync(join(dir, name), text) };
};
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Past the settle time, with room for the system to say. */
const settled = () => wait(SETTLE * 8);

describe('watching a project’s pages for a save', () => {
	it('says a version’s page changed, once, after its writes have stopped', async () => {
		const w = pages({ 'v1.html': '<p>first</p>' });
		w.write('v1.html', '<p>second</p>');
		w.write('v1.html', '<p>second, written in two goes</p>');
		await settled();
		expect(w.told).toEqual(['v1']);
	});

	it('says again for each later change, and for the version it was', async () => {
		const w = pages({ 'v1.html': '<p>1</p>', 'v2.html': '<p>2</p>' });
		w.write('v2.html', '<p>2, changed</p>');
		await settled();
		w.write('v1.html', '<p>1, changed</p>');
		await settled();
		w.write('v2.html', '<p>2, changed again</p>');
		await settled();
		expect(w.told).toEqual(['v2', 'v1', 'v2']);
	});

	it('says a version saved for the first time', async () => {
		const w = pages();
		w.write('v1.html', '<p>new</p>');
		await settled();
		expect(w.told).toEqual(['v1']);
	});

	it('says nothing for a page written as it was, or for what is not a version’s page', async () => {
		const w = pages({ 'v1.html': '<p>same</p>' });
		w.write('v1.html', '<p>same</p>');
		w.write('v1.tsx', 'source');
		w.write('notes.html', '<p>x</p>');
		w.write('v1.html.bak', '<p>x</p>');
		await settled();
		expect(w.told).toEqual([]);
	});

	it('says nothing once closed, and a folder that is not there is nothing to watch', async () => {
		const w = pages({ 'v1.html': '<p>1</p>' });
		w.watching.close();
		w.write('v1.html', '<p>changed</p>');
		await settled();
		expect(w.told).toEqual([]);
		const none = watchPages(join(tmpdir(), 'dsnr-pages-not-there'), () => undefined, SETTLE);
		expect(() => none.close()).not.toThrow();
	});
});
