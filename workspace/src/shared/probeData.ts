/** Plain data only: it crosses from the page (`page/probe.ts`) to the probe outside it. */

export const INTERACTIVE_ROLES = [
	'button',
	'link',
	'checkbox',
	'radio',
	'switch',
	'tab',
	'menuitem',
	'menuitemcheckbox',
	'menuitemradio',
	'option',
	'slider',
	'spinbutton',
	'combobox',
	'textbox',
	'searchbox',
];

export interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** `path` is a selector that finds it again; `html` is cut short. */
export interface Spot {
	path: string;
	html: string;
	box: Box;
	text: string;
}

/** `at` is its box on the page, not the window; `covered` is what is drawn wholly over it. */
export interface Stop extends Spot {
	at: Box;
	tabindex: number;
	native: boolean;
	role: string | null;
	/** In a modal dialog, where going round its own controls is what it is for. */
	modal: boolean;
	covered: string[];
	/** Focus is in a frame from another site, whose stops cannot be read: Tab may stay on it for several presses. */
	opaque: boolean;
}

export interface Added {
	/** Its first words; `length` is all of it. */
	text: string;
	length: number;
	live: boolean;
	/** Inside a dialog: not a status message. */
	dialog: boolean;
	/** A control, or holding one or a heading: new content, not a status message. */
	interactive: boolean;
	/** Text that changed where it was (a clock ticking), not something added: never a status message by itself. */
	inPlace: boolean;
}

export interface Watched {
	opened: string[];
	added: Added[];
	changes: number;
}

/** Drawn under 3:1 against what is behind it. */
export interface FaintPart extends Spot {
	part: 'edge' | 'icon';
	ratio: number;
	colors: [string, string];
}

/** `tied`: a field names the message; `unnamed`: fields marked invalid with none; `native`: the browser checked it. */
export interface FormErrors {
	messages: (Spot & { tied: boolean })[];
	unnamed: Spot[];
	native: boolean;
}

/** `discloses` (`aria-expanded`, `aria-controls`): what it shows is a disclosure, not a message. */
export interface Button extends Spot {
	discloses: boolean;
}

/** `capped`: there was more than it reads, so a "none found" is only of what it read. */
export interface Read {
	elements: number;
	capped: boolean;
}

export interface Field {
	spot: Spot;
	kind: 'select' | 'toggle' | 'text';
}
