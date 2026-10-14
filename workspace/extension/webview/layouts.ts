import type { View } from './vscode';

/** The two ways to see a list of things with pictures, as the app has them: a grid of cards, which it starts in, or rows. */
export const LAYOUTS = [
	{ value: 'grid', label: 'Grid', icon: 'layout' },
	{ value: 'list', label: 'List', icon: 'list-unordered' },
] as const satisfies { value: View; label: string; icon: string }[];
