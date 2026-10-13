import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AVATAR_ORIGIN, CODE_FOLDERS, DEFAULT_CLONE_FOLDER } from '../src/shared/config';
import { avatarUrl } from '../src/shared/hostUrls';

describe("the app's settings", () => {
	it("lets the window load the avatars it is shown: its own page's CSP names the host's avatar origin", () => {
		// The CSP is a static page's: it cannot import the setting, so this is what keeps the two the same.
		const html = readFileSync(join(__dirname, '../src/renderer/index.html'), 'utf8');
		const imgSrc = /img-src([^;]*);/.exec(html)?.[1] ?? '';
		expect(imgSrc.split(/\s+/)).toContain(AVATAR_ORIGIN);
		expect(avatarUrl('noah')?.startsWith(`${AVATAR_ORIGIN}/`)).toBe(true);
	});

	it('makes the default clone folder one of the code folders discovery looks in', () => {
		expect(CODE_FOLDERS).toContain(DEFAULT_CLONE_FOLDER);
	});
});
