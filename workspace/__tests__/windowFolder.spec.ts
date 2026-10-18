import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { windowFolder } from '../src/core/services/windowFolder';

/** A folder for each window's DSNR (QUALITY_PASS finding 3), so two windows never build into, or prune, the same one. */

let root: string;
beforeEach(() => void (root = mkdtempSync(join(tmpdir(), 'dsnr-window-folder-'))));
afterEach(() => rmSync(root, { recursive: true, force: true }));

it('gives two running windows two folders, and one window the same folder each time it asks', () => {
	const alive = () => true;
	const first = windowFolder(root, 101, alive);
	const second = windowFolder(root, 202, alive);
	expect(second).not.toBe(first);
	expect(windowFolder(root, 101, alive)).toBe(first);
	expect(readFileSync(join(first, 'owner'), 'utf8')).toBe('101');
});

it('gives a window opened again the folder of one that has closed, with the builds it kept', () => {
	const first = windowFolder(root, 101, () => true);
	writeFileSync(join(first, 'kept-build'), 'x');
	const again = windowFolder(root, 303, (pid) => pid !== 101);
	expect(again).toBe(first);
	expect(existsSync(join(again, 'kept-build'))).toBe(true);
	expect(readFileSync(join(again, 'owner'), 'utf8')).toBe('303');
});

it('clears the builds an earlier version made straight in the folder, which no window uses again', () => {
	mkdirSync(join(root, '875b40d6ea01-e3b0-9d7e0dfc'));
	windowFolder(root, 101, () => true);
	expect(existsSync(join(root, '875b40d6ea01-e3b0-9d7e0dfc'))).toBe(false);
});
