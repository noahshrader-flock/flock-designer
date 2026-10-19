import type { Theme } from '../shared/prototypeTheme';

/**
 * The sun for light and the moon for dark, drawn here because VS Code's icon font has neither (Feather's, MIT): the size of a
 * codicon (16px), in the text's colour, hidden from assistive technology like `Icon`: whatever it is beside says what it means. Its
 * size is as `Icon`'s: its own, or `xs` over a column of small things (a theme's heading).
 */
export const ModeIcon = ({ mode, size = 'default' }: { mode: Theme; size?: 'default' | 'xs' }) => (
	<svg
		aria-hidden="true"
		className={size === 'default' ? 'mode-icon' : `mode-icon icon-${size}`}
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		{mode === 'dark' ? (
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
		) : (
			<>
				<circle cx="12" cy="12" r="5" />
				<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
			</>
		)}
	</svg>
);
