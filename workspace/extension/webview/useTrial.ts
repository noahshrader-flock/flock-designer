import { useCallback, useEffect, useRef, useState } from 'react';
import type { TokenEdit } from '../../src/shared/contract';
import { sameChange } from '../../src/shared/tokens';
import { onHost } from './host';
import { vscode } from './vscode';

/**
 * The change to the tokens being tried, as the extension keeps it (`TokenTrial`), so the panel and every design system tab
 * see the same one: told whenever it changes, and once the page says it is ready. Changing it here tells the extension,
 * which tells every page, this one too: what it is told back is the change it has, so nothing is built again for it.
 */
export const useTrial = (): [TokenEdit[], (edits: TokenEdit[]) => void] => {
	const [edits, setEdits] = useState<TokenEdit[]>([]);
	const now = useRef(edits);
	const keep = useCallback((next: TokenEdit[]) => {
		if (sameChange(next, now.current)) return;
		now.current = next;
		setEdits(next);
	}, []);
	useEffect(() => onHost((m) => m.type === 'token-edits' && keep(m.edits)), [keep]);
	const change = useCallback(
		(next: TokenEdit[]) => {
			keep(next);
			vscode().postMessage({ type: 'token-edits', edits: next });
		},
		[keep],
	);
	return [edits, change];
};
