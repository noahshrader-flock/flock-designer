import { describe, expect, it } from 'vitest';
import { MAX_KEPT, scrubbed } from '../src/shared/scrub';

const text = (s: string) => scrubbed(s).text;

describe('what is taken out of a request before it is kept', () => {
	it('takes out each kind of secret by its shape, and says what it was', () => {
		const cases: [string, string, string][] = [
			['a GitHub token', 'use ghp_abcdefghijklmnopqrstuvwxyz0123456789 for it', 'use [removed: a GitHub token] for it'],
			['a GitHub token', 'github_pat_11ABCDEFG0abcdefghijklmnop_qrstuvwxyz', '[removed: a GitHub token]'],
			['a Slack token', 'xoxb-1234567890-abcdefghij', '[removed: a Slack token]'],
			['an access key', 'AKIAIOSFODNN7EXAMPLE', '[removed: an access key]'],
			['an API key', 'sk-abcdefghijklmnopqrstuvwxyz123456', '[removed: an API key]'],
			['a token', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk', '[removed: a token]'],
			['a token', 'Authorization: Bearer abcdefghijklmnopqrstuvwx', 'Authorization: Bearer [removed: a token]'],
			['a token', 'open https://x.test/a?id=3&access_token=abc123def456&x=1', 'open https://x.test/a?id=3&access_token=[removed: a token]&x=1'],
			['a password', 'clone https://noah:hunter2secret@github.com/x/y', 'clone https://[removed: a password]@github.com/x/y'],
			['a secret', 'the password: hunter2secret, then log in', 'the password: [removed: a secret], then log in'],
			['a secret', 'API_KEY="abcdef123456"', 'API_KEY="[removed: a secret]"'],
			['an email address', 'ask jo.smith+test@flocksafety.com about it', 'ask [removed: an email address] about it'],
			[
				'a phone number',
				'call (404) 555-0123 or 404-555-0123 or +1 404.555.0123',
				'call [removed: a phone number] or [removed: a phone number] or [removed: a phone number]',
			],
		];
		for (const [kind, said, kept] of cases) {
			const out = scrubbed(said);
			expect(out.text).toBe(kept);
			expect(out.removed).toContain(kind);
		}
	});

	it('takes out a whole private key, to its end or the end of the text', () => {
		const key = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nabc\n-----END RSA PRIVATE KEY-----';
		expect(text(`before\n${key}\nafter`)).toBe('before\n[removed: a private key]\nafter');
		expect(text('x\n-----BEGIN PRIVATE KEY-----\nMIIEow')).toBe('x\n[removed: a private key]');
	});

	it('names each kind once, whatever its count', () => {
		const out = scrubbed('a@b.co and c@d.co, then 404-555-0123, then e@f.co');
		expect(out.removed).toEqual(['an email address', 'a phone number']);
	});

	it('leaves ordinary words alone, however much they look like the above', () => {
		const plain = [
			'Add a second FSAlert below the first saying "Firmware update available", and change the heading to "Device alerts and updates".',
			'Make the button 56px tall, 12px → 16px, in rgb(16, 128, 98) or #108062.',
			'The token has expired, so show the password field; a key point is that the secret is hidden.',
			'See https://github.com/flocksafety/flock-coke/pull/123 and version 5.7.7 from 2026-10-21 at 1280 x 800.',
			'Show 3 devices offline, 12 online, 404 errors, and ids 123-45-678.',
			'Use the token: the design token for it.',
		];
		for (const said of plain) expect(scrubbed(said)).toEqual({ text: said, removed: [] });
	});

	it('keeps no more than it keeps, cutting after the scrub so a secret at the cut is not left in part', () => {
		const token = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
		const out = text(`${'a'.repeat(MAX_KEPT - 10)} ${token}`);
		expect(out).not.toContain('ghp_');
		expect(out.length).toBeLessThanOrEqual(MAX_KEPT);
		expect(text('a'.repeat(MAX_KEPT + 50))).toHaveLength(MAX_KEPT);
	});

	it('keeps every line break, so a request keeps its shape', () => {
		expect(text('one\n\n- two a@b.co\n- three')).toBe('one\n\n- two [removed: an email address]\n- three');
	});
});
