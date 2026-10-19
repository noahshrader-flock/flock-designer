import { describe, expect, it } from 'vitest';
import { routeIn } from '../src/shared/work';

/** Where codebase work's preview opens: at the work's own route, never anywhere but the preview. */
describe('routeIn', () => {
	it("joins the work's route onto the preview, keeping its port", () => {
		expect(routeIn('http://localhost:3100/', '/roles/compare')).toBe('http://localhost:3100/roles/compare');
		expect(routeIn('http://localhost:3000/', '/roles/compare?state=error')).toBe('http://localhost:3000/roles/compare?state=error');
	});

	it('opens where the preview starts when there is no route', () => {
		expect(routeIn('http://localhost:3100/', null)).toBe('http://localhost:3100/');
		expect(routeIn('http://localhost:3100/', undefined)).toBe('http://localhost:3100/');
		expect(routeIn('http://localhost:3100/', '')).toBe('http://localhost:3100/');
	});

	it('never leaves the preview, whatever the record says', () => {
		// asRoute refuses these where the record is read; this is the second door, because the value
		// is joined onto an address the preview then loads.
		for (const bad of ['https://evil.test/steal', '//evil.test', 'javascript:alert(1)']) {
			expect(routeIn('http://localhost:3100/', bad)).toBe('http://localhost:3100/');
		}
	});

	it('keeps a preview address that is not a URL rather than failing to open anything', () => {
		expect(routeIn('not a url', '/roles/compare')).toBe('not a url');
	});
});
