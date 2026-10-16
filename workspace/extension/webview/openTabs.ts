import { createContext, useContext } from 'react';
import { NO_TABS_SHOWN, type TabsShown } from '../src/messages';

/** The tabs in front in the editor, as the extension says (`tabs-shown`), for whatever in the panel stands for one to mark it. */
const OpenTabs = createContext<TabsShown>(NO_TABS_SHOWN);

export const OpenTabsProvider = OpenTabs.Provider;
export const useOpenTabs = (): TabsShown => useContext(OpenTabs);
