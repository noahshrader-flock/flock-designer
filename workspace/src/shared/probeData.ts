/**
 * What the probe's page code (`page/probe.ts`) gives back from a page, as the probe outside the page reads it
 * (`services/probe`): plain data, as it crosses from the page to the probe.
 */

/** The roles a control may have: what is operated, and named, as a control (WAI-ARIA's widget roles a person acts on). */
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

/** An element as the probe reports it: a selector that finds it again, its HTML cut short, its box and its text. */
export interface Spot {
	path: string;
	html: string;
	box: Box;
	text: string;
}

/** The element Tab is on: its box on the page (not the window), its tabindex, whether it is native or has a role, and what is drawn wholly over it. */
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

/** Something added to the page while it was watched: its text, and whether a live region announced it. */
export interface Added {
	/** Its first words, and how long it is in all. */
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

/** What the page did while it was watched: windows it opened, what was added, and how many changes there were. */
export interface Watched {
	opened: string[];
	added: Added[];
	changes: number;
}

/** A part drawn under 3:1 against what is behind it: a field's edge, or a control's icon. */
export interface FaintPart extends Spot {
	part: 'edge' | 'icon';
	ratio: number;
	colors: [string, string];
}

/** After a form was sent: messages that appeared, whether a field names each, fields marked invalid with none, and whether the browser checked it. */
export interface FormErrors {
	messages: (Spot & { tied: boolean })[];
	unnamed: Spot[];
	native: boolean;
}

/** A button, and whether it opens or closes something it names (`aria-expanded`, `aria-controls`): what it shows is a disclosure, not a message. */
export interface Button extends Spot {
	discloses: boolean;
}

/** How much of the page the probe read: what it read, and whether there was more than it reads (then a "none found" is only of what it read). */
export interface Read {
	elements: number;
	capped: boolean;
}

/** A control whose value a person changes: a list, a box to tick, a field to type in. */
export interface Field {
	spot: Spot;
	kind: 'select' | 'toggle' | 'text';
}
