import { describe, expect, it } from 'vitest';
import { asChangeRequestUrl, avatarUrl, cloneUrl, compareUrl, loginFromNoreply, numberFromChangeRequestUrl, treeUrl } from '../src/shared/hostUrls';

describe("the host's web addresses", () => {
	it('names a branch, and a folder on it, each part encoded on its own, so a slash stays a slash', () => {
		expect(treeUrl('flocksafety/flock-coke', 'feature/a b')).toBe('https://github.com/flocksafety/flock-coke/tree/feature/a%20b');
		expect(treeUrl('acme/ui', 'feat/#1', 'src/components/FS Button')).toBe('https://github.com/acme/ui/tree/feat/%231/src/components/FS%20Button');
		expect(compareUrl('acme/ui', 'develop', 'dsnr/voice-1')).toBe('https://github.com/acme/ui/compare/develop...dsnr/voice-1?expand=1');
		expect(cloneUrl('acme/ui')).toBe('https://github.com/acme/ui.git');
	});

	it('knows a change request by its address, and its number', () => {
		expect(asChangeRequestUrl('https://github.com/o/r/pull/12')).toBe('https://github.com/o/r/pull/12');
		for (const v of ['https://evil.test/o/r/pull/1', 'https://github.com/o/r/issues/1', 3]) expect(asChangeRequestUrl(v)).toBeNull();
		expect(numberFromChangeRequestUrl('https://github.com/o/r/pull/12')).toBe(12);
		expect(numberFromChangeRequestUrl('Creating pull request…\nhttps://github.com/o/r/pull/7\n')).toBe(7);
		expect(numberFromChangeRequestUrl('https://github.com/o/r')).toBeNull();
	});

	it("is a person's avatar by their login, escaped, or none without one", () => {
		expect(avatarUrl(null)).toBeNull();
		expect(avatarUrl('a b')).toBe('https://avatars.githubusercontent.com/a%20b?size=64');
	});

	it("reads the account from either form of the host's private email, and does not guess from any other", () => {
		expect(loginFromNoreply('104806027+HShaw215@users.noreply.github.com')).toBe('HShaw215');
		expect(loginFromNoreply('clintonmedbery@users.noreply.github.com')).toBe('clintonmedbery');
		expect(loginFromNoreply('hunter.shaw@flocksafety.com')).toBeNull();
	});
});
