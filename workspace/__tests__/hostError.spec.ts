import { describe, expect, it } from 'vitest';
import { HostError, hostErrorKind, kindOfStatus } from '../src/host/hostError';

describe('what went wrong with the host, said one way', () => {
	it('is a kind from the status the host gave', () => {
		expect([404, 403, 401, 409, 422, 500, 502, 400, undefined].map(kindOfStatus)).toEqual([
			'notFound',
			'forbidden',
			'reauth',
			'conflict',
			'conflict',
			'unreachable',
			'unreachable',
			'failed',
			'failed',
		]);
	});

	it('is told by its kind, and anything that is not one has none', () => {
		expect(hostErrorKind(new HostError('Not Found', 404))).toBe('notFound');
		expect(hostErrorKind(new HostError('gh is not installed', undefined, 'missingCli'))).toBe('missingCli');
		expect(hostErrorKind(Object.assign(new Error('Not Found'), { status: 404 }))).toBeNull();
	});
});
