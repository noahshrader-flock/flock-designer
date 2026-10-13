import { describe, expect, it } from 'vitest';
import { readMessage, replyTo } from '../extension/src/messages';

/**
 * What the panel's page may ask of the extension (Phase 0.5): only the messages it knows, in exactly their shape, as the
 * app checks what its window sends. Anything else is dropped.
 */

describe('a message from the panel', () => {
	it.each([[{ type: 'new-prototype' }], [{ type: 'locate-design-system' }]])('%o is read', (m) => {
		expect(readMessage(m)).toEqual(m);
	});

	it.each([[null], ['new-prototype'], [{}], [{ type: 'run', command: 'rm -rf /' }], [{ type: 'new-prototype', extra: 1 }]])('%o is dropped', (m) => {
		expect(readMessage(m)).toBeNull();
	});

	it('is answered, until what it asks for is built, by saying so', () => {
		expect(replyTo({ type: 'new-prototype' })).toBe('Starting a prototype from DSNR is not built yet.');
		expect(replyTo({ type: 'locate-design-system' })).toBe('Locating a design system from DSNR is not built yet.');
	});
});
