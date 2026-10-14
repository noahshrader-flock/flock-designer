/**
 * The page agent as it is added to a page the site builds (`_viewer/page-agent.js`): installed on the page's own window,
 * with the page code it runs.
 */
// First: the page code reads it as it loads.
import './singlePage';
import { installAgent } from './agent';
import { pick } from './pick';
import { drawPins } from './pins';

installAgent(window, { pick, drawPins });
