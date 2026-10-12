/**
 * How the app looks (Settings): **Auto**, which follows the computer's own light or dark setting and is what it starts as,
 * **Light**, or **Dark**. Auto is called `system`, as Electron calls it, so the app's setting is what the app hands the
 * system's theme (`nativeTheme.themeSource`), with no translation between them.
 */
export type Appearance = 'system' | 'light' | 'dark';

/** The choices, in the order they are shown, with the word each is shown as. */
export const APPEARANCES: { value: Appearance; label: string }[] = [
	{ value: 'system', label: 'Auto' },
	{ value: 'light', label: 'Light' },
	{ value: 'dark', label: 'Dark' },
];

export const isAppearance = (v: unknown): v is Appearance => APPEARANCES.some((a) => a.value === v);

/** An appearance as it is read back from a file: Auto for anything that is not one. */
export const asAppearance = (v: unknown): Appearance => (isAppearance(v) ? v : 'system');
