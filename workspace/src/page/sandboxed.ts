// Must be first in the page agent's bundle, before anything that might read storage or cookies.
import { installStandIns } from './standIns';

installStandIns(window, document);
