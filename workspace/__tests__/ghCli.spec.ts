import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ghApi } from '../src/main/services/ghCli';

/** GitHub's command line, as the app runs it. */

describe('ghApi', () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'dsnr-gh-'));
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	it('runs the command line found for it, and gives back what GitHub answered', async () => {
		// A stand-in for `gh` that answers as GitHub would: what is run is the one named, not whatever is on the PATH.
		const gh = join(dir, 'gh');
		writeFileSync(gh, '#!/bin/sh\necho \'{"login":"noah","asked":"\'"$2"\'"}\'\n');
		chmodSync(gh, 0o755);
		expect(await ghApi(gh).api('/user')).toEqual({ login: 'noah', asked: '/user' });
	});

	it('fails, rather than hangs, when the command line is not there', async () => {
		await expect(ghApi(join(dir, 'missing')).api('/user')).rejects.toThrow();
	});
});
