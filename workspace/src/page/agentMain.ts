/**
 * The page agent as it is added to a page the site builds (`_viewer/page-agent.js`): installed on the page's own window,
 * with the page code it runs.
 */
// First, before the prototype's own code: stand-ins for the storage and cookies a page with no origin of its own is refused,
// the theme its address asks for, and what the page code reads as it loads.
import './sandboxed';
import './theme';
import './singlePage';
import { installAgent } from './agent';
import { pick } from './pick';
import { drawPins } from './pins';

installAgent(window, { pick, drawPins });
