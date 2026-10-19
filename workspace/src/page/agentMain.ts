// These must run first, before the prototype's own code and the page code below.
import './sandboxed';
import './theme';
import './singlePage';
import { installAgent } from './agent';
import { pick } from './pick';
import { drawPins } from './pins';

installAgent(window, { pick, drawPins });
