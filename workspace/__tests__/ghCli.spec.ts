import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RepoFiles } from '../src/codeHost/repoFiles';
import { ghApi } from '../src/core/services/platform/ghCli';
import { hostErrorKind } from '../src/codeHost/hostError';

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

	it('fails, rather than hangs, when the command line is not there, and says it is missing', async () => {
		const failed = await ghApi(join(dir, 'missing'))
			.api('/user')
			.catch((e: unknown) => e);
		expect(hostErrorKind(failed)).toBe('missingCli');
	});

	/** A `gh` that fails as GitHub's does, `gh: <message> (HTTP <status>)` on its error output. */
	const failing = (stderr: string) => {
		const gh = join(dir, 'gh');
		writeFileSync(gh, `#!/bin/sh\necho '${stderr}' >&2\nexit 1\n`);
		chmodSync(gh, 0o755);
		return ghApi(gh);
	};

	it("fails with the host's own error, by its kind, as the app's session does", async () => {
		expect(
			await failing('gh: Not Found (HTTP 404)')
				.api('/x')
				.catch((e: unknown) => [hostErrorKind(e), (e as { status?: number }).status]),
		).toEqual(['notFound', 404]);
		expect(
			hostErrorKind(
				await failing('To get started with GitHub CLI, please run:  gh auth login')
					.api('/x')
					.catch((e: unknown) => e),
			),
		).toBe('reauth');
	});

	it('lets a file that is not there be made through it, as through the app’s session', async () => {
		// GET answers 404; PUT answers. Behind `gh`, "not there" must still mean "create", not a failure.
		const gh = join(dir, 'gh');
		writeFileSync(gh, `#!/bin/sh\ncase "$*" in *PUT*) echo '{}' ;; *) echo 'gh: Not Found (HTTP 404)' >&2; exit 1 ;; esac\n`);
		chmodSync(gh, 0o755);
		await expect(new RepoFiles(ghApi(gh), { owner: 'o', repo: 'r' }).writeFile('projects/x/a.md', 'a', 'm')).resolves.toBeUndefined();
	});
});
