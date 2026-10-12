import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { APPEARANCES, asAppearance, isAppearance } from '../src/shared/appearance';
import { AppearanceMemory } from '../src/main/services/appearance';

/**
 * The app's appearance (Settings): Auto, which follows the computer's own light or dark setting and is what it starts as,
 * Light, or Dark. Kept in its own small file in the app's settings, checked on the way back in.
 */

describe('the appearances', () => {
	it('are Auto, Light and Dark, Auto being the system’s own setting', () => {
		expect(APPEARANCES).toEqual([
			{ value: 'system', label: 'Auto' },
			{ value: 'light', label: 'Light' },
			{ value: 'dark', label: 'Dark' },
		]);
	});

	it('are told apart from anything else, which is Auto when it is read and refused when it is asked for', () => {
		expect(['system', 'light', 'dark'].every(isAppearance)).toBe(true);
		expect([undefined, null, 'auto', 'Dark', 3].some(isAppearance)).toBe(false);
		expect(asAppearance('dark')).toBe('dark');
		expect(asAppearance('sepia')).toBe('system');
		expect(asAppearance(undefined)).toBe('system');
	});
});

describe('the appearance kept', () => {
	let dir: string;
	let file: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'appearance-'));
		file = join(dir, 'appearance.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('is Auto until one is chosen', () => {
		expect(new AppearanceMemory(file).read()).toBe('system');
	});

	it('is the one chosen, kept for the next time the app opens', () => {
		new AppearanceMemory(file).write('dark');
		expect(new AppearanceMemory(file).read()).toBe('dark');
		new AppearanceMemory(file).write('light');
		expect(new AppearanceMemory(file).read()).toBe('light');
	});

	it('is Auto when what was kept is not an appearance, or not a file that reads', () => {
		writeFileSync(file, JSON.stringify({ appearance: 'sepia' }));
		expect(new AppearanceMemory(file).read()).toBe('system');
		writeFileSync(file, '{ not json');
		expect(new AppearanceMemory(file).read()).toBe('system');
	});

	it('is kept where the app keeps its settings, and a place that cannot be written to is no failure', () => {
		expect(AppearanceMemory.defaultPath('/data')).toBe(join('/data', 'appearance.json'));
		mkdirSync(file);
		expect(() => new AppearanceMemory(file).write('dark')).not.toThrow();
		expect(new AppearanceMemory(file).read()).toBe('system');
	});
});
