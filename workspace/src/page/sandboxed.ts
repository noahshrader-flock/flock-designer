/**
 * First in the page agent's bundle, before anything that might read them: the stand-ins a page framed with no origin of its
 * own needs for its storage and cookies (`standIns.ts`). Where the browser allows the real ones, nothing changes.
 */
import { installStandIns } from './standIns';

installStandIns(window, document);
