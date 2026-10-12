import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WindowMemory, restoreState } from '../src/main/services/windowMemory';
import { appPaths } from '../src/main/appPaths';

const laptop = { x: 0, y: 0, width: 1512, height: 944 };
const external = { x: 1512, y: 0, width: 2560, height: 1415 };
const fallback = { width: 1260, height: 780 };

describe('restoreState', () => {
	it('brings back the size and place it was left in', () => {
		expect(restoreState({ x: 100, y: 80, width: 1400, height: 900 }, [laptop], fallback)).toEqual({ x: 100, y: 80, width: 1400, height: 900 });
	});

	it('remembers being maximized', () => {
		expect(restoreState({ x: 0, y: 0, width: 1200, height: 800, maximized: true }, [laptop], fallback).maximized).toBe(true);
	});

	it('uses the default when nothing was saved, or what was saved is junk', () => {
		expect(restoreState(null, [laptop], fallback)).toEqual(fallback);
		expect(restoreState({ width: 'wide', height: NaN }, [laptop], fallback)).toEqual(fallback);
		expect(restoreState('x', [laptop], fallback)).toEqual(fallback);
	});

	it('never opens smaller than is usable, or larger than the biggest screen', () => {
		expect(restoreState({ width: 100, height: 100 }, [laptop], fallback)).toMatchObject({ width: 900, height: 560 });
		expect(restoreState({ width: 9000, height: 9000 }, [laptop], fallback)).toMatchObject({ width: 1512, height: 944 });
	});

	it('does not leave the window where there is no screen any more', () => {
		// It was on the external display, which has since been unplugged.
		const away = restoreState({ x: 2000, y: 100, width: 1400, height: 900 }, [laptop], fallback);
		expect(away).toEqual({ width: 1400, height: 900 });
		expect('x' in away).toBe(false);
	});

	it('keeps a place on a screen that is still there', () => {
		expect(restoreState({ x: 2000, y: 100, width: 1400, height: 900 }, [laptop, external], fallback)).toMatchObject({ x: 2000, y: 100 });
	});

	it('drops a place that would leave only a sliver of the window showing', () => {
		expect('x' in restoreState({ x: 1450, y: 100, width: 1400, height: 900 }, [laptop], fallback)).toBe(false);
	});
});

describe('WindowMemory', () => {
	let dir: string;
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('writes and reads back, and reads nothing from a missing or broken file', () => {
		dir = mkdtempSync(join(tmpdir(), 'fd-window-'));
		const memory = new WindowMemory(appPaths(dir).window);
		expect(memory.read()).toBeNull();
		memory.write({ x: 1, y: 2, width: 1000, height: 700, maximized: false });
		expect(memory.read()).toEqual({ x: 1, y: 2, width: 1000, height: 700, maximized: false });
		writeFileSync(appPaths(dir).window, '{not json');
		expect(memory.read()).toBeNull();
	});
});
