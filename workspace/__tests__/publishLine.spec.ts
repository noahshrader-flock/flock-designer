import { describe, expect, it } from 'vitest';
import { publishLineText } from '../src/renderer/PublishStatus';

describe('the publishing line', () => {
	it('says nothing when there is nothing to publish from here', () => {
		expect(publishLineText({ state: 'unavailable' })).toBeNull();
	});

	it('says where publishing has got to while it is working', () => {
		expect(publishLineText({ state: 'working' })).toBe('Syncing…');
		expect(publishLineText({ state: 'shared', at: '2026-10-06T12:00:00Z' })).toBe('Everything is synced');
	});

	it('names the one thing that is held back, rather than saying some work is not synced', () => {
		// The line follows a person across every screen. Naming what is held is the difference between
		// a thing they can act on and a nag about something unidentified.
		const text = publishLineText({
			state: 'held',
			at: '2026-10-06T12:00:00Z',
			problems: [{ what: 'feature/role-comparison', why: 'It has changes on GitHub that this machine does not have.' }],
		});
		expect(text).toBe('Not synced: feature/role-comparison');
	});

	it('counts them when there are several, since the list does not fit on one line', () => {
		const text = publishLineText({
			state: 'held',
			at: '2026-10-06T12:00:00Z',
			problems: [
				{ what: 'feature/one', why: 'a' },
				{ what: 'feature/two', why: 'b' },
			],
		});
		expect(text).toBe('2 things are not synced');
	});

	it('says nothing when it is held with nothing to name, rather than a bare count of zero', () => {
		expect(publishLineText({ state: 'held', at: '2026-10-06T12:00:00Z', problems: [] })).toBeNull();
	});
});
