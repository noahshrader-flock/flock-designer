/** A source decides only what its files mean and how a change is written back; which primitive a token is, is `primitiveOf`'s. */
import type { DesignToken, DesignTokens, TokenChange } from '../../../../shared/contract';
import type { CatalogReads } from '../componentCatalog';
import { inGeneratedFolder } from '../../../../shared/generatedFolders';

/**
 * `read` is null when it finds no tokens. `edit` changes the token in its place and nowhere else, written as the library
 * writes it (the change is already checked for the token's kind), and throws, in words, when it cannot.
 */
export interface TokenSource {
	name: string;
	read(reads: CatalogReads, files: string[]): Promise<Omit<DesignTokens, 'looked'> | null>;
	edit(text: string, token: DesignToken, to: TokenChange): string;
}

export const notWhereRead = (token: DesignToken): Error =>
	new Error(`${token.path} is not written where it was read (${token.source.file}:${token.source.line}), so it was not changed.`);

/** Not its tests or stories, which use tokens rather than define them. */
export const isLibraryFile = (path: string): boolean =>
	!inGeneratedFolder(path) && !/(^|\/)(\.storybook|__tests__|__mocks__)\//.test(path) && !/\.(stories|test|spec)\.\w+$/.test(path);

/** The panel shows groups in the order they first appear, so this orders them once for every source. */
export const semanticFirst = (tokens: DesignToken[], isPrimitive: (t: DesignToken) => boolean): DesignToken[] => {
	const byCategory = new Map<string, DesignToken[]>();
	for (const t of tokens) byCategory.set(t.category, [...(byCategory.get(t.category) ?? []), t]);
	return [...byCategory.values()].flatMap((own) => [...own.filter((t) => !isPrimitive(t)), ...own.filter(isPrimitive)]);
};
