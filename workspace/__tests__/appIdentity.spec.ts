import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The working-copies folder is still named `flock-designer` on purpose: renaming must not start every person's copy from
 * nothing, so it moves only by a migration, never by the name changing.
 */

const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<string, string>;

describe('the name', () => {
	it('is DSNR, in its package', () => {
		expect(pkg.name).toBe('dsnr');
		expect(pkg.productName).toBeUndefined();
	});

	it('keeps the command’s saved data where it always was, named by one field the command reads', () => {
		expect(pkg.settingsFolder).toBe('flock-designer');
		expect(readFileSync(join(root, 'bin', 'dsnr.mjs'), 'utf8')).toContain('pkg.settingsFolder');
	});

	it('has no other name in its package', () => {
		expect(readFileSync(join(root, 'package.json'), 'utf8')).not.toMatch(/Flock Designer|flkd/);
	});
});
