import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * What the app is called, and what is kept under the old name on purpose. The app is DSNR; its package and window say
 * so. The folder where it keeps its settings, its sign-in and its working copies is still named `flock-designer`, and is
 * named by one field, because renaming the app must not start every person's copy from nothing: it moves only by a
 * migration, never by the name changing.
 */

const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<string, string>;

describe('the app’s name', () => {
	it('is DSNR, in its package and for the window and menu', () => {
		expect(pkg.name).toBe('dsnr');
		expect(pkg.productName).toBe('DSNR');
	});

	it('keeps its saved data where it always was, named by one field that the app and the command both read', () => {
		expect(pkg.settingsFolder).toBe('flock-designer');
		expect(readFileSync(join(root, 'bin', 'dsnr.mjs'), 'utf8')).toContain('pkg.settingsFolder');
		expect(readFileSync(join(root, 'src', 'main', 'index.ts'), 'utf8')).toContain("pkg.settingsFolder");
	});

	it('is DSNR in the window’s own page, which the title bar shows', () => {
		expect(readFileSync(join(root, 'src', 'renderer', 'index.html'), 'utf8')).toContain('<title>DSNR</title>');
	});

	it('has no other name in its package', () => {
		expect(readFileSync(join(root, 'package.json'), 'utf8')).not.toMatch(/Flock Designer|flkd/);
	});
});
