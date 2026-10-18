import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cliDataFolder, commandLinePrototypes, tellCommandLine } from '../src/main/services/cliFolder';

/**
 * One set of prototypes for the panel and the `dsnr` command (QUALITY_PASS finding 1): the extension says in the command's
 * folder where it builds them, and the command builds them there too.
 */

let dir: string;
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), 'dsnr-cli-folder-'))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('the command’s folder', () => {
	it('is in the application-data folder each system names', () => {
		expect(cliDataFolder('flock-designer', { platform: 'darwin', home: '/Users/a' })).toBe('/Users/a/Library/Application Support/flock-designer');
		expect(cliDataFolder('flock-designer', { platform: 'linux', home: '/home/a', env: {} })).toBe('/home/a/.config/flock-designer');
		expect(cliDataFolder('flock-designer', { platform: 'linux', home: '/home/a', env: { XDG_CONFIG_HOME: '/x' } })).toBe('/x/flock-designer');
		expect(cliDataFolder('flock-designer', { platform: 'win32', home: 'C:\\a', env: { APPDATA: '/roaming' } })).toBe('/roaming/flock-designer');
	});
});

describe('where the command builds prototypes', () => {
	it('is where the extension said it builds them', () => {
		const extension = join(dir, 'globalStorage', 'prototypes');
		mkdirSync(extension, { recursive: true });
		tellCommandLine(join(dir, 'cli'), extension);
		expect(commandLinePrototypes(join(dir, 'cli'))).toBe(extension);
	});

	it('is its own with no note, a note that cannot be read, or one that names a folder that is gone', () => {
		const cli = join(dir, 'cli');
		expect(commandLinePrototypes(cli)).toBe(join(cli, 'prototypes'));
		mkdirSync(cli, { recursive: true });
		writeFileSync(join(cli, 'extension.json'), 'not json');
		expect(commandLinePrototypes(cli)).toBe(join(cli, 'prototypes'));
		tellCommandLine(cli, join(dir, 'gone'));
		expect(commandLinePrototypes(cli)).toBe(join(cli, 'prototypes'));
		tellCommandLine(cli, 'relative/path');
		expect(commandLinePrototypes(cli)).toBe(join(cli, 'prototypes'));
	});
});
