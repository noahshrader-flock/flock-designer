import { useCallback, useEffect, useState } from 'react';
import type { TokenEdit } from '../../src/shared/contract';
import { onHost } from './host';
import { vscode } from './vscode';

/**
 * The change to the tokens being tried, as the extension keeps it (`TokenTrial`), so the panel and every design system tab
 * see the same one: told whenever it changes, and once the page says it is ready. Changing it here tells the extension,
 * which tells every page.
 */
export const useTrial = (): [TokenEdit[], (edits: TokenEdit[]) => void] => {
	const [edits, setEdits] = useState<TokenEdit[]>([]);
	useEffect(() => onHost((m) => m.type === 'token-edits' && setEdits(m.edits)), []);
	const change = useCallback((next: TokenEdit[]) => {
		setEdits(next);
		vscode().postMessage({ type: 'token-edits', edits: next });
	}, []);
	return [edits, change];
};
