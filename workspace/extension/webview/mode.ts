import { createContext, useContext } from 'react';
import { DEFAULT_THEME, type Theme } from '../../src/shared/prototypeTheme';

/** The mode components are shown in, and choosing another: what a page's parts read (`useMode`), given where it starts (`useModeChoice`). */
export type Mode = [Theme, (mode: Theme) => void];

const ModeContext = createContext<Mode>([DEFAULT_THEME, () => undefined]);

export const ModeProvider = ModeContext.Provider;
export const useMode = (): Mode => useContext(ModeContext);
