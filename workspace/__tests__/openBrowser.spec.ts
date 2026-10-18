import { describe, expect, it } from 'vitest';
import { browserCommand } from '../src/core/services/openBrowser';

/** Opening a published page in the browser: only a plain https address, by argv, the way each platform opens one. */

const PAGE = 'https://noahshrader-flock.github.io/flock-designer/alert-history/v2/';

describe('opening an address', () => {
	it('uses the program each platform opens addresses with, with the address as an argument and never in a shell', () => {
		expect(browserCommand(PAGE, 'darwin')).toEqual({ file: 'open', args: [PAGE] });
		expect(browserCommand(PAGE, 'linux')).toEqual({ file: 'xdg-open', args: [PAGE] });
		expect(browserCommand(PAGE, 'win32')).toEqual({ file: 'cmd', args: ['/c', 'start', '""', PAGE] });
	});

	it('takes the deploy’s version on the end, as the app’s links carry', () => {
		expect(browserCommand(`${PAGE}?v=abc1234`, 'darwin')).not.toBeNull();
	});

	it('opens nothing that is not a plain https address, whatever it says', () => {
		for (const bad of [
			'http://example.test/',
			'file:///etc/passwd',
			'javascript:alert(1)',
			'https://x.test/a b',
			'https://x.test/a&calc',
			'https://x.test/a;rm',
			'https://x.test/$(id)',
			'https://x.test/?q=1',
			'open /Applications',
			'',
		]) {
			expect(browserCommand(bad, 'win32')).toBeNull();
			expect(browserCommand(bad, 'darwin')).toBeNull();
		}
	});
});
