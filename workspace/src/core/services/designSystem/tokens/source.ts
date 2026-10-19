/**
 * What every way of finding a library's tokens shares: the shape of a source, which of the library's files are its own.
 * Which primitive a token is, is the vocabulary's (`primitiveOf` in `shared/primitives.ts`). A source decides only what
 * its files mean, and how a change is written back into them.
 */
import type { DesignToken, DesignTokens, TokenChange } from '../../../../shared/contract';
import type { CatalogReads } from '../componentCatalog';
import { inGeneratedFolder } from '../../../../shared/generatedFolders';

/**
 * A way a library can keep its tokens: given the library's own files, the list when it finds tokens there, else `null`;
 * and the text of a token's file with the token changed, written as the library writes it, in its place and nowhere
 * else (the change is checked for the token's kind already). A source that cannot write a change says why, by throwing.
 */
export interface TokenSource {
	name: string;
	read(reads: CatalogReads, files: string[]): Promise<Omit<DesignTokens, 'looked'> | null>;
	edit(text: string, token: DesignToken, to: TokenChange): string;
}

/** What a writer says when the place a token was read from is not there to write to. */
export const notWhereRead = (token: DesignToken): Error =>
	new Error(`${token.path} is not written where it was read (${token.source.file}:${token.source.line}), so it was not changed.`);

/**
 * The library's own files: not what is installed, built or generated, and not its tests or stories, which use tokens
 * rather than define them.
 */
export const isLibraryFile = (path: string): boolean =>
	!inGeneratedFolder(path) && !/(^|\/)(\.storybook|__tests__|__mocks__)\//.test(path) && !/\.(stories|test|spec)\.\w+$/.test(path);

/**
 * The tokens in the order the panel shows them: within each category, the semantic ones (`primary`, a surface) first and
 * the primitives (raw scales) last. The panel shows groups in the order they first appear, so this decides it once for
 * every source; each source says which of its tokens are primitive.
 */
export const semanticFirst = (tokens: DesignToken[], isPrimitive: (t: DesignToken) => boolean): DesignToken[] => {
	const byCategory = new Map<string, DesignToken[]>();
	for (const t of tokens) byCategory.set(t.category, [...(byCategory.get(t.category) ?? []), t]);
	return [...byCategory.values()].flatMap((own) => [...own.filter((t) => !isPrimitive(t)), ...own.filter(isPrimitive)]);
};
