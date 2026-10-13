import { createElement, useState } from 'react';
import { TokensPanel } from '../src/renderer/TokensPanel';
import { TokenChangesProvider, useTokenChangesFor } from '../src/renderer/tokenChanges';
import { useTokenBranch } from '../src/renderer/useTokenBranch';
import type { DesignToken, DesignTokens, TokenEdit } from '../src/shared/contract';
import { PALETTE_GROUP } from '../src/shared/tokens';
import type { DeclaredTarget } from '../src/shared/wcag';

/** A color token as a reader gives one: where it is written follows its group (the tones' files, a theme's file). */
export const color = (path: string, group: string, set: string, name: string, value: string, more: Partial<DesignToken> = {}): DesignToken => ({
	path,
	kind: 'color',
	category: 'Color',
	group,
	set,
	name,
	value,
	source: { file: group === PALETTE_GROUP ? `src/colors/tones/${set}.ts` : `src/colors/theme/${group.toLowerCase()}.ts`, line: 3 },
	...more,
});

/**
 * The tokens panel as the Design System tab gives it its change: the tab keeps the edits, and the panel reads them. `onEdits`
 * is told each change as it is made, and `accessibility` is what contrast is judged at.
 */
export const TokensHarness = ({
	tokens,
	live,
	accessibility,
	onEdits,
}: {
	tokens: DesignTokens;
	live: boolean;
	accessibility: DeclaredTarget;
	onEdits?: (edits: TokenEdit[]) => void;
}) => {
	const [edits, setEdits] = useState<TokenEdit[]>([]);
	const change = (e: TokenEdit[]) => (onEdits?.(e), setEdits(e));
	const branch = useTokenBranch('acme/ui', edits, change);
	const changes = useTokenChangesFor(tokens.tokens, edits, change, accessibility);
	return createElement(TokenChangesProvider, { value: changes }, createElement(TokensPanel, { tokens, live, branch }));
};
