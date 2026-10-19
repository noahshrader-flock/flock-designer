import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { windowFolder } from '../src/core/services/platform/windowFolder';

/** A folder for each window's DSNR, so two windows never build into, or prune, the same one. */

let root: string;
beforeEach(() => void (root = mkdtempSync(join(tmpdir(), 'dsnr-window-folder-'))));
afterEach(() => rmSync(root, { recursive: true, force: true }));

/** The holder files a folder has. */
const holders = (dir: string) => readdirSync(dir).filter((f) => f.startsWith('owner-'));

it('gives two running windows two folders, and one window the same folder each time it asks', () => {
	const alive = () => true;
	const first = windowFolder(root, 101, alive);
	const second = windowFolder(root, 202, alive);
	expect(second).not.toBe(first);
	expect(windowFolder(root, 101, alive)).toBe(first);
	expect(holders(first)).toEqual(['owner-1']);
	expect(readFileSync(join(first, 'owner-1'), 'utf8')).toBe('101');
});

it('gives a window opened again the folder of one that has closed, with the builds it kept', () => {
	const first = windowFolder(root, 101, () => true);
	writeFileSync(join(first, 'kept-build'), 'x');
	const again = windowFolder(root, 303, (pid) => pid !== 101);
	expect(again).toBe(first);
	expect(existsSync(join(again, 'kept-build'))).toBe(true);
	expect(holders(again)).toEqual(['owner-1', 'owner-2']);
	expect(readFileSync(join(again, 'owner-2'), 'utf8')).toBe('303');
});

it('gives a folder whose holder is gone to one window alone, however many read it gone at once', () => {
	const first = windowFolder(root, 101, () => true);
	// Window 505 reads the holder gone, and while it asks, window 404 takes the folder: 505, finding the turn it would make
	// already made, goes on to another folder rather than sharing this one.
	const late = windowFolder(root, 505, (pid) => {
		if (pid === 101 && !existsSync(join(first, 'owner-2'))) writeFileSync(join(first, 'owner-2'), '404');
		return pid === 404;
	});
	expect(late).not.toBe(first);
	expect(readFileSync(join(first, 'owner-2'), 'utf8')).toBe('404');
	// Taken again after that, only the last turn before it is kept.
	expect(windowFolder(root, 606, (pid) => pid === 505)).toBe(first);
	expect(holders(first)).toEqual(['owner-2', 'owner-3']);
	expect(readFileSync(join(first, 'owner-3'), 'utf8')).toBe('606');
});

it('clears the builds an earlier version made straight in the folder, which no window uses again', () => {
	mkdirSync(join(root, '875b40d6ea01-e3b0-9d7e0dfc'));
	windowFolder(root, 101, () => true);
	expect(existsSync(join(root, '875b40d6ea01-e3b0-9d7e0dfc'))).toBe(false);
});
