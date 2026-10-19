/**
 * Tokens are read as text from the library's files, never run. Sources are tried in order and the first that finds any
 * gives the list, so a library is never read two ways at once.
 */
import type { DesignTokens } from '../../../shared/contract';
import type { CatalogReads } from './componentCatalog';
import { cssVariables } from './tokens/cssVariables';
import { type TokenSource, isLibraryFile } from './tokens/source';
import { themeFiles } from './tokens/themeFiles';
import { tokenFiles } from './tokens/tokenFiles';

const SOURCES: TokenSource[] = [themeFiles, cssVariables, tokenFiles];

/** The source that read a list of tokens is also the one that must write a change to them. */
export const sourceNamed = (name: string | null): TokenSource | undefined => SOURCES.find((s) => s.name === name);

export const readTokens = async (reads: CatalogReads): Promise<DesignTokens> => {
	const files = (await reads.listFiles('')).filter(isLibraryFile);
	const looked = SOURCES.map((s) => s.name);
	for (const source of SOURCES) {
		const found = await source.read(reads, files);
		if (found) return { ...found, looked };
	}
	return { source: null, tokens: [], problems: [], looked };
};
