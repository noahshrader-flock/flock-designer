import { useEffect, useState } from 'react';
import type { ComponentTokens } from '../shared/contract';
import { askWhile } from './askWhile';

/** How many of the values a component sets itself are listed before the rest: counted in the app, kept to open in VS Code. */
export const MOST_LISTED = 8;
/** How many of the other components that share a token are named on its row. */
const MOST_NAMED = 3;

/**
 * Which tokens a component draws with (T6, decision 29), by its story file: asked, then again every few seconds while
 * every story is drawn the first time for a commit; a failure is said as its answer. `retry` asks again. The same in the
 * app and in VS Code.
 */
export const useComponentTokens = (file: string): { answer: ComponentTokens | null; retry: () => void } => {
	const [answer, setAnswer] = useState<ComponentTokens | null>(null);
	const [asks, setAsks] = useState(0);
	useEffect(
		() =>
			askWhile(
				async (): Promise<ComponentTokens> => {
					const r = await window.workspace.componentTokens(file);
					return r.ok ? r.value : { state: 'failed', error: r.error };
				},
				(next) => next.state === 'building',
				setAnswer,
			),
		[file, asks],
	);
	return { answer, retry: () => setAsks((n) => n + 1) };
};

/** Which other components share a token, in a few words: none, or the first few by name and how many more. */
export const sharedWith = (others: string[]): string =>
	others.length === 0
		? 'no other component'
		: `also ${others.slice(0, MOST_NAMED).join(', ')}${others.length > MOST_NAMED ? ` and ${others.length - MOST_NAMED} more` : ''}`;
