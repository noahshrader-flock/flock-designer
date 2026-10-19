// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applyEditorTheme, applyScheme, systemIsDark, watchSystemScheme } from '../src/viewer/scheme';

/**
 * The published page's bar follows light or dark (src/viewer/scheme.ts): the computer's setting in a browser, VS Code's
 * in DSNR's review tab. Dark is the app's `dark` class on the page, and its colour-scheme says so to the browser, so a page
 * framed by VS Code is see-through over the editor.
 */
afterEach(() => {
	document.documentElement.className = '';
	document.documentElement.removeAttribute('style');
	document.body.removeAttribute('style');
	document.body.className = '';
});

describe('VS Code’s theme, passed on by the review tab', () => {
	it('sets its colours on the page and its kind on the body, high contrast light as high contrast too, and takes them off for another', () => {
		applyEditorTheme(document, {
			kind: 'vscode-high-contrast-light',
			colors: { '--vscode-foreground': '#292929', '--vscode-contrastBorder': '#0f4a85' },
		});
		expect(document.documentElement.style.getPropertyValue('--vscode-contrastBorder')).toBe('#0f4a85');
		expect([...document.body.classList].sort()).toEqual(['vscode-high-contrast', 'vscode-high-contrast-light']);
		applyEditorTheme(document, { kind: 'vscode-dark', colors: { '--vscode-foreground': '#cccccc' } });
		expect(document.documentElement.style.getPropertyValue('--vscode-foreground')).toBe('#cccccc');
		// What the last theme set and this one does not is gone, so nothing of high contrast is left over.
		expect(document.documentElement.style.getPropertyValue('--vscode-contrastBorder')).toBe('');
		expect([...document.body.classList]).toEqual(['vscode-dark']);
		applyEditorTheme(document, null);
		expect(document.documentElement.style.getPropertyValue('--vscode-foreground')).toBe('');
		expect([...document.body.classList]).toEqual([]);
	});
});

describe('light or dark', () => {
	it('is the app’s dark class, and says so to the browser', () => {
		applyScheme(document, true, false);
		expect(document.documentElement.classList.contains('dark')).toBe(true);
		expect(document.documentElement.style.colorScheme).toBe('dark');
		applyScheme(document, false, false);
		expect(document.documentElement.classList.contains('dark')).toBe(false);
		expect(document.documentElement.style.colorScheme).toBe('light');
	});

	it('leaves the page’s own background in a browser, and takes it off when VS Code frames the page, so the editor shows through', () => {
		applyScheme(document, false, false);
		expect(document.body.style.background).toBe('');
		applyScheme(document, true, true);
		expect(document.body.style.background).toBe('transparent');
		applyScheme(document, true, false);
		expect(document.body.style.background).toBe('');
	});

	it('is told when the computer’s setting changes, until it stops listening, and hears nothing where the browser cannot say', () => {
		const listeners: (() => void)[] = [];
		let dark = false;
		const win = {
			matchMedia: () => ({
				get matches() {
					return dark;
				},
				addEventListener: (_: string, l: () => void) => void listeners.push(l),
				removeEventListener: (_: string, l: () => void) => void listeners.splice(listeners.indexOf(l), 1),
			}),
		} as never;
		const heard: boolean[] = [];
		const stop = watchSystemScheme(win, (d) => heard.push(d));
		dark = true;
		listeners.forEach((l) => l());
		expect(heard).toEqual([true]);
		stop();
		expect(listeners).toHaveLength(0);
		expect(() => watchSystemScheme({} as never, () => undefined)()).not.toThrow();
	});

	it('is the computer’s setting until VS Code says, and light where the browser cannot say', () => {
		expect(systemIsDark({ matchMedia: () => ({ matches: true }) } as never)).toBe(true);
		expect(systemIsDark({ matchMedia: () => ({ matches: false }) } as never)).toBe(false);
		expect(systemIsDark({} as never)).toBe(false);
	});
});
