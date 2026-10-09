/**
 * What every way of finding a library's tokens shares (decision 18): the shape of a source, which of the library's files
 * are its own, and the one rule for which tab a token is on. A source decides only what its files mean.
 */
import type { DesignToken, DesignTokens } from '../../../shared/contract';
import type { CatalogReads } from '../componentCatalog';

/** A way a library can keep its tokens: given the library's own files, the list when it finds tokens there, else `null`. */
export interface TokenSource {
	name: string;
	read(reads: CatalogReads, files: string[]): Promise<Omit<DesignTokens, 'looked'> | null>;
}

/**
 * The library's own files: not what is installed, built or generated, and not its tests or stories, which use tokens
 * rather than define them.
 */
export const isLibraryFile = (path: string): boolean =>
	!/(^|\/)(node_modules|dist|build|out|coverage|storybook-static|\.storybook|__tests__|__mocks__)\//.test(path) && !/\.(stories|test|spec)\.\w+$/.test(path);

/**
 * The tab a token is on, from its kind and its name: every colour is Colour, a radius is Shape, spacing is Spacing. A
 * size that is none of these (a font size, a width, a breakpoint) is `null`, and is left out rather than placed by guess.
 */
export const categoryOf = (kind: DesignToken['kind'], name: string): string | null => {
	if (kind === 'colour') return 'Colour';
	if (/radius|rounded|corner/i.test(name)) return 'Shape';
	if (/spacing|space|gap|gutter|inset/i.test(name)) return 'Spacing';
	return null;
};

/** A word as a heading has it: `light` is `Light`. */
export const capitalised = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** A CSS length the panel shows as a dimension: `8px`, `0.25rem`, `1.5em`. */
export const DIMENSION = /^-?\d*\.?\d+(px|rem|em)$/;
