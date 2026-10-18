import { useState } from 'react';
import type { ComponentTokens, TokenUsers } from '../shared/contract';
import { useTriedAnswer } from './useTriedAnswer';

/** How many of the other components that share a token are named on its row. */
const MOST_NAMED = 3;

/**
 * Which tokens a component draws with (T6, decision 29), by its story file: asked as every answer worked out in the
 * background is (`useTriedAnswer`), again every few seconds while every story is drawn the first time for a commit; none
 * until it is first asked, a failure said as its answer. `retry` asks again.
 */
export const useComponentTokens = (file: string): { answer: ComponentTokens | { state: 'none' }; retry: () => void } => {
	const [asks, setAsks] = useState(0);
	const answer = useTriedAnswer<ComponentTokens | { state: 'none' }>(`${file}\u0000${asks}`, false, () => window.workspace.componentTokens(file));
	return { answer, retry: () => setAsks((n) => n + 1) };
};

/** The components that draw with a token, by its path, asked as a component's tokens are; again while every story is drawn. */
export const useTokenUsers = (path: string): TokenUsers | { state: 'none' } =>
	useTriedAnswer<TokenUsers | { state: 'none' }>(path, false, () => window.workspace.tokenUsers(path));

/** Which other components share a token, in a few words: none, or the first few by name and how many more. */
export const sharedWith = (others: string[]): string =>
	others.length === 0
		? 'no other component'
		: `also ${others.slice(0, MOST_NAMED).join(', ')}${others.length > MOST_NAMED ? ` and ${others.length - MOST_NAMED} more` : ''}`;
