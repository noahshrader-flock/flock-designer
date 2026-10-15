import { describe, expect, it } from 'vitest';
import { CODE_FOLDERS, DEFAULT_CLONE_FOLDER } from '../src/shared/config';
import { AVATAR_ORIGIN, avatarUrl } from '../src/shared/hostUrls';

describe("the app's settings", () => {
	it("names an avatar on the host's own avatar origin, which a page that shows one must allow", () => {
		expect(avatarUrl('noah')?.startsWith(`${AVATAR_ORIGIN}/`)).toBe(true);
	});

	it('makes the default clone folder one of the code folders discovery looks in', () => {
		expect(CODE_FOLDERS).toContain(DEFAULT_CLONE_FOLDER);
	});
});
