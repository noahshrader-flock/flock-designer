import { useState } from 'react';
import type { ComponentTokens, TokenUsers } from '../../../src/shared/contract';
import { useTriedAnswer } from './useTriedAnswer';
import { workspace } from '../host';

const MOST_NAMED = 3;

export const useComponentTokens = (file: string): { answer: ComponentTokens | { state: 'none' }; retry: () => void } => {
	const [asks, setAsks] = useState(0);
	const answer = useTriedAnswer<ComponentTokens | { state: 'none' }>(`${file}\u0000${asks}`, false, () => workspace().componentTokens(file));
	return { answer, retry: () => setAsks((n) => n + 1) };
};

export const useTokenUsers = (path: string): TokenUsers | { state: 'none' } =>
	useTriedAnswer<TokenUsers | { state: 'none' }>(path, false, () => workspace().tokenUsers(path));

export const sharedWith = (others: string[]): string =>
	others.length === 0
		? 'no other component'
		: `also ${others.slice(0, MOST_NAMED).join(', ')}${others.length > MOST_NAMED ? ` and ${others.length - MOST_NAMED} more` : ''}`;
