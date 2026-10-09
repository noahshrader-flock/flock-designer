/**
 * The design library's tokens, as one list (T1 of the design system plan): what the Design System tab shows and, later,
 * lets a person adjust. **Found, not listed:** read from the library's own files, so a colour added to the library is
 * here with nothing written in this app. Read as text, never run, as the catalog reads stories (`componentCatalog.ts`).
 *
 * **In layers, behind one reader** (decision 18): each way a library can keep its tokens is a source (`tokens/`), tried
 * in order on the library's own files, and the first that finds tokens gives the list, so one library is never read two
 * ways at once. Every source returns the same shape, so nothing that shows or changes a token learns where it came from.
 * Theme files (MUI's way, and FUI's) are tried first, then CSS variables (shadcn's and Tailwind's), then design token
 * files (the standard JSON). The fourth layer, an agent reading what is there, is not built.
 *
 * A value that is not plain is named, with its file and line, and the rest are still read: this never guesses.
 */
import type { DesignTokens } from '../../shared/contract';
import type { CatalogReads } from './componentCatalog';
import { cssVariables } from './tokens/cssVariables';
import { type TokenSource, isLibraryFile } from './tokens/source';
import { themeFiles } from './tokens/themeFiles';
import { tokenFiles } from './tokens/tokenFiles';

/** The ways tokens are found, in the order they are tried. */
const SOURCES: TokenSource[] = [themeFiles, cssVariables, tokenFiles];

/** The library's tokens, from the first source that finds any; none, and what it looked for, when no source does. */
export const readTokens = async (reads: CatalogReads): Promise<DesignTokens> => {
	const files = (await reads.listFiles('')).filter(isLibraryFile);
	const looked = SOURCES.map((s) => s.name);
	for (const source of SOURCES) {
		const found = await source.read(reads, files);
		if (found) return { ...found, looked };
	}
	return { source: null, tokens: [], problems: [], looked };
};
