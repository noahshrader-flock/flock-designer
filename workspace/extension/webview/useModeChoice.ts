import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_THEME, type Theme } from '../../src/shared/prototypeTheme';
import { onHost } from './host';
import type { Mode } from './mode';
import { vscode } from './vscode';

/**
 * The mode components are shown in (MODES_PLAN Phase 1), as the extension keeps it (`ModeChoice`), so the panel and every
 * component's tab show the same one: told whenever it changes, and once the page says it is ready. Choosing another tells the
 * extension, which tells every page. Called once, where a page starts; its parts read it (`useMode`).
 */
export const useModeChoice = (): Mode => {
	const [mode, setMode] = useState<Theme>(DEFAULT_THEME);
	useEffect(() => onHost((m) => m.type === 'mode' && setMode(m.mode)), []);
	const choose = useCallback((next: Theme) => {
		setMode(next);
		vscode().postMessage({ type: 'set-mode', mode: next });
	}, []);
	return [mode, choose];
};
