import { createContext, useContext } from 'react';
import type { TabsShown } from '../src/messages';

/** The tabs in front in the editor, as the extension says (`tabs-shown`), for whatever in the panel stands for one to mark it. */
const OpenTabs = createContext<TabsShown>({ projects: [], components: [] });

export const OpenTabsProvider = OpenTabs.Provider;
export const useOpenTabs = (): TabsShown => useContext(OpenTabs);
