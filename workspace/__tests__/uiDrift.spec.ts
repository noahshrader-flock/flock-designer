import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { titleCase } from '../src/shared/titleCase';
import { windowSources } from './windowSources';

/**
 * shadcn's primitives (`src/renderer/ui/`) are its own code, each changed here only where the app needs it, with the
 * reason written beside the change. `shadcn add --overwrite` would put each back to stock with nothing failing, so each
 * change is pinned here by what it adds: an overwrite fails loudly, and says which one went.
 */

const ui = (file: string) => readFileSync(join(__dirname, '..', 'src/renderer/ui', file), 'utf8');

const PINNED: [file: string, what: string, why: string][] = [
	// How every overlay makes the native preview step aside: without it the preview is drawn over every menu and dialog.
	['dialog.tsx', 'useOverlayRef', 'a dialog over the preview makes it step aside'],
	['popover.tsx', 'useOverlayRef', 'a popover over the preview makes it step aside'],
	['tooltip.tsx', 'useOverlayRef', 'a tooltip over the preview makes it step aside'],
	['dropdown-menu.tsx', 'useOverlayRef', 'a menu over the preview makes it step aside'],
	['sheet.tsx', 'useOverlayRef', 'a sheet over the preview makes it step aside'],
	['dialog.tsx', 'top-(--nav-height)', 'the overlay starts under the top bar, which stays usable'],
	['sheet.tsx', 'top-(--nav-height)', 'the overlay starts under the top bar, which stays usable'],
	['dialog.tsx', 'top-[15%]', 'a dialog grows downward from a fixed top, not from its middle'],
	['dialog.tsx', 'function DialogBody', 'the part of a dialog that scrolls, and lays out its body'],
	['dialog.tsx', 'flex min-h-0 flex-1 flex-col gap-4', 'a dialog body is a column, so no dialog says so again'],
	['alert.tsx', 'warning:', 'work held back'],
	['alert.tsx', 'success:', 'something finished and did what was asked'],
	['alert.tsx', 'pr-28', 'room for a Try again in the action slot'],
	['alert.tsx', 'variant === "destructive" ? "alert" : "status"', 'only an alert that says something went wrong interrupts'],
	['badge.tsx', 'success:', 'a success badge'],
	['avatar.tsx', '"2xs"', 'the small avatars on cards and comments'],
	['slider.tsx', '"aria-label": label', 'the thumb is named, since it is what is focused'],
	['toggle-group.tsx', 'fullWidth', 'a toggle group that fills its row'],
	['accordion.tsx', 'not-last:data-[state=closed]:border-b', 'a line under a closed group only'],
	['tabs.tsx', 'TabsVariantContext', 'the variant said once, on the root'],
	['tabs.tsx', 'data-slot="tabs-scroll"', 'a strip of tabs scrolls sideways when they do not fit'],
	['tabs.tsx', '--tabs-inset', 'the strip is inset as its content is'],
	['field.tsx', 'function FieldSet', 'the stock field, with its whole set'],
	['dialog.tsx', 'dark:bg-black/50', 'a dialog’s scrim that can be seen in dark'],
	['sheet.tsx', 'dark:bg-black/50', 'a sheet’s scrim that can be seen in dark'],
];

describe('the changes to shadcn’s primitives', () => {
	it.each(PINNED)('keeps %s’s “%s”: %s', (file, what) => {
		expect(ui(file)).toContain(what);
	});

	it('keeps behavior out of them: a tab’s label is as it is given', () => {
		expect(ui('tabs.tsx')).not.toContain('titleCase');
	});
});

describe('the window’s own components', () => {
	it('name every tab in title case, as they write it: the primitive does not change it', () => {
		const wrong = windowSources().flatMap(({ path, text }) =>
			[...text.matchAll(/<TabsTrigger\b[^>]*>([^<{]+)<\/TabsTrigger>/g)]
				.map((m) => m[1]!.trim())
				.filter((label) => titleCase(label) !== label)
				.map((label) => `${path}: ${label}`),
		);
		expect(wrong).toEqual([]);
	});

	/**
	 * Inline styles, which bypass the theme, only where a value is known only at run time; each has a comment saying so.
	 * A new one fails here, so it is decided, not slipped in.
	 */
	it('style inline only where a value is known only at run time', () => {
		const allowed: Record<string, number> = {
			// A spacing token's bar, a radius sample, a shadow sample: the token's own value.
			'src/renderer/Primitives.tsx': 3,
			// The panel's dragged width.
			'src/renderer/ResizablePanel.tsx': 1,
			// The story frame's measured height.
			'src/renderer/StoryFrame.tsx': 1,
			// A color swatch.
			'src/renderer/Swatch.tsx': 1,
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
