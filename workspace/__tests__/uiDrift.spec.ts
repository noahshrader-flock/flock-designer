import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { windowSources } from './windowSources';

/**
 * shadcn's primitives (`src/renderer/ui/`) are its own code, each changed here only where the app needs it, with the
 * reason written beside the change. `shadcn add --overwrite` would put each back to stock with nothing failing, so each
 * change is pinned here by what it adds: an overwrite fails loudly, and says which one went.
 */

const ui = (file: string) => readFileSync(join(__dirname, '..', 'src/renderer/ui', file), 'utf8');

const PINNED: [file: string, what: string, why: string][] = [
	['dialog.tsx', 'top-(--nav-height)', 'the overlay starts under the top bar, which stays usable'],
	['dialog.tsx', 'top-[15%]', 'a dialog grows downward from a fixed top, not from its middle'],
	['dialog.tsx', 'function DialogBody', 'the part of a dialog that scrolls, and lays out its body'],
	['dialog.tsx', 'flex min-h-0 flex-1 flex-col gap-4', 'a dialog body is a column, so no dialog says so again'],
	['alert.tsx', 'warning:', 'work held back'],
	['alert.tsx', 'success:', 'something finished and did what was asked'],
	['alert.tsx', 'pr-28', 'room for a Try again in the action slot'],
	['alert.tsx', 'variant === "destructive" ? "alert" : "status"', 'only an alert that says something went wrong interrupts'],
	['badge.tsx', 'success:', 'a success badge'],
	['toggle-group.tsx', 'fullWidth', 'a toggle group that fills its row'],
	['field.tsx', 'function FieldSet', 'the stock field, with its whole set'],
	['tooltip.tsx', 'delayDuration = 800', 'a tooltip waits, so a pointer passing over a toolbar opens none'],
	['tooltip.tsx', 'disableHoverableContent = true', 'a tooltip is never hovered into or in the way'],
	['dialog.tsx', 'dark:bg-black/50', 'a dialog’s scrim that can be seen in dark'],
];

describe('the changes to shadcn’s primitives', () => {
	it.each(PINNED)('keeps %s’s “%s”: %s', (file, what) => {
		expect(ui(file)).toContain(what);
	});

	it('has none of the primitives the app’s screens needed and nothing now does (the avatar is the comments’, so it is here)', () => {
		const present = readdirSync(join(__dirname, '..', 'src/renderer/ui')).sort();
		expect(present.filter((f) => ['popover.tsx', 'sheet.tsx', 'slider.tsx', 'accordion.tsx', 'tabs.tsx', 'card.tsx'].includes(f))).toEqual([]);
	});

	it('has no overlay registry: the native preview it served is gone', () => {
		expect(existsSync(join(__dirname, '..', 'src/renderer/overlays.ts'))).toBe(false);
		for (const f of ['dialog.tsx', 'tooltip.tsx', 'dropdown-menu.tsx']) expect(ui(f)).not.toContain('useOverlayRef');
	});
});

describe('the window’s own components', () => {
	/**
	 * Inline styles, which bypass the theme, only where a value is known only at run time; each has a comment saying so.
	 * A new one fails here, so it is decided, not slipped in.
	 */
	it('style inline only where a value is known only at run time', () => {
		const allowed: Record<string, number> = {
			// The panel's dragged width.
			'src/renderer/ResizablePanel.tsx': 1,
			// The comment box, at the pin's position in the window.
			'src/renderer/comments/CommentBox.tsx': 1,
		};
		const found = Object.fromEntries(
			windowSources()
				.map(({ path, text }) => [path, (text.match(/\bstyle=\{/g) ?? []).length] as const)
				.filter(([, n]) => n > 0),
		);
		expect(found).toEqual(allowed);
	});
});
