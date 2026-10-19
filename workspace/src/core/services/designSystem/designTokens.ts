/**
 * The design library's tokens, read as text from its own files, never run. Each way a library keeps tokens is a source
 * (`tokens/`), tried in order; the first that finds any gives the list, so a library is never read two ways at once, and
 * every source returns the same shape. A value that is not plain is named with its file and line: this never guesses.
 */
import type { DesignTokens } from '../../../shared/contract';
import type { CatalogReads } from './componentCatalog';
import { cssVariables } from './tokens/cssVariables';
import { type TokenSource, isLibraryFile } from './tokens/source';
import { themeFiles } from './tokens/themeFiles';
import { tokenFiles } from './tokens/tokenFiles';

/** The ways tokens are found, in the order they are tried. */
const SOURCES: TokenSource[] = [themeFiles, cssVariables, tokenFiles];

/** The source a list of tokens was read by, which is also the one that writes a change to them. */
export const sourceNamed = (name: string | null): TokenSource | undefined => SOURCES.find((s) => s.name === name);

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
