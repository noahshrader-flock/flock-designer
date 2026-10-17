import type { CellId } from '../../src/main/services/probe/cells';

/**
 * The probe's known-bad fixtures (A3 of the accessibility plan): for each cell measured in the page, one small page with
 * one planted defect, and its clean twin, the same page with the defect put right. Plain HTML, so what a cell catches is
 * the defect and not a framework's way of writing it.
 */
const page = (body: string, css = '') =>
	`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixture</title><style>body { font: 16px/1.4 sans-serif; margin: 20px; } ${css}</style></head><body><main>${body}</main></body></html>`;

/** One planted defect, the words its finding must say, and the clean twin. */
export interface Fixture {
	bad: string;
	good: string;
	finds: string;
}

const pair = (finds: string, bad: string, good: string, css: [string, string] = ['', '']): Fixture => ({ finds, bad: page(bad, css[0]), good: page(good, css[1]) });

const LONG = 'A sentence long enough to fit on one line in a wide window, and to need a second line when the window is half as wide.';
const ICON = '<svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 2h12v12H2z"/></svg>';
const TIP = '<button>Info</button><div class="tip">More about this</div>';
const SMALL = (style: string) => `<button style="width: 16px; height: 16px; padding: 0; ${style}">A</button>`;

/** Each page cell's fixtures: one for each thing it measures, so every rule of a cell is caught by its own. */
export const PROBE_FIXTURES: Partial<Record<CellId, Fixture[]>> = {
	structure: [
		pair('is drawn as a heading', '<div style="font-size: 24px; font-weight: 700">Settings</div><p>Text</p>', '<h2>Settings</h2><p>Text</p>'),
		pair(
			'a table of data with no header cell',
			'<table><tr><td>Name</td><td>Status</td></tr><tr><td>Camera 4</td><td>Online</td></tr></table>',
			'<table><tr><th>Name</th><th>Status</th></tr><tr><td>Camera 4</td><td>Online</td></tr></table>',
		),
	],
	'name-role-value': [
		pair('a control with no name', `<button>${ICON}</button>`, `<button aria-label="Close">${ICON}</button>`),
		pair('it has no role', '<span tabindex="0">Open</span>', '<span tabindex="0" role="button">Open</span>'),
	],
	'keyboard-reach': [
		pair('looks clickable', `<div style="cursor: pointer" onclick="this.textContent = 'Done'">Delete</div>`, `<button onclick="this.textContent = 'Done'">Delete</button>`),
		pair(
			'the Tab walk never reached it',
			`<button onkeydown="if (event.key === 'Tab') { event.preventDefault(); document.getElementById('c').focus(); }">A</button><button>B</button><button id="c">C</button>`,
			'<button>A</button><button>B</button><button id="c">C</button>',
		),
	],
	'keyboard-trap': [
		pair(
			'never leaves them',
			`<button>First</button><input id="trap" aria-label="Name"><button>Last</button><script>document.getElementById('trap').addEventListener('keydown', (e) => { if (e.key === 'Tab' || e.key === 'Escape') e.preventDefault(); });</script>`,
			'<button>First</button><input aria-label="Name"><button>Last</button>',
		),
	],
	'focus-order': [
		pair('moves it out of the page', '<button tabindex="2">Second</button> <button tabindex="1">First</button>', '<button>First</button> <button>Second</button>'),
		pair(
			'Tab goes back up the page',
			'<div style="display: flex; flex-direction: column-reverse; align-items: start"><button>One</button><button>Two</button></div>',
			'<div style="display: flex; flex-direction: column; align-items: start"><button>One</button><button>Two</button></div>',
		),
	],
	'focus-visible': [pair('drawn as it is when not', '<button>Save</button>', '<button>Save</button>', ['button:focus { outline: none; }', ''])],
	'focus-obscured': [
		pair(
			'wholly covered by',
			'<button>Accept</button><div style="position: fixed; left: 0; top: 0; width: 100%; height: 120px; background: #eee">Banner</div>',
			'<button>Accept</button><div style="position: fixed; left: 0; bottom: 0; width: 100%; height: 120px; background: #eee">Banner</div>',
		),
	],
	'on-focus': [
		pair('opened a window', `<input aria-label="Search" onfocus="window.open('/elsewhere')">`, '<input aria-label="Search">'),
		pair(
			'opened a dialog',
			`<input aria-label="Search" onfocus="document.getElementById('d').show()"><dialog id="d"><p>Pick one</p></dialog>`,
			`<input aria-label="Search"><dialog id="d"><p>Pick one</p></dialog>`,
		),
	],
	'keyboard-operate': [
		pair(
			'nothing on Enter or Space',
			`<div role="button" tabindex="0" onclick="this.textContent = 'Saved'">Save</div>`,
			`<div role="button" tabindex="0" onclick="this.textContent = 'Saved'" onkeydown="if (event.key === 'Enter' || event.key === ' ') this.click()">Save</div>`,
		),
	],
	'reading-order': [
		pair(
			'drawn above it',
			'<div style="display: flex; flex-direction: column-reverse"><p>Step one</p><p>Step two</p></div>',
			'<div style="display: flex; flex-direction: column"><p>Step one</p><p>Step two</p></div>',
		),
	],
	orientation: [pair('characters of text upright', `<p>${LONG}</p>`, `<p>${LONG}</p>`, ['@media (orientation: portrait) { main { display: none; } }', ''])],
	'color-only': [
		pair(
			'forced colors paints it over',
			'<p><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #d00"></span> Camera 4</p>',
			'<p><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #d00; border: 2px solid #d00"></span> Camera 4</p>',
		),
	],
	'contrast-states': [
		pair('on focus', '<button>Save</button>', '<button>Save</button>', [
			'button { color: #000; background: #fff; border: 1px solid #000; } button:focus { color: #ccc; }',
			'button { color: #000; background: #fff; border: 1px solid #000; } button:focus { color: #333; }',
		]),
		pair('on hover', '<button>Save</button>', '<button>Save</button>', [
			'button { color: #000; background: #fff; border: 1px solid #000; } button:hover { color: #ccc; }',
			'button { color: #000; background: #fff; border: 1px solid #000; } button:hover { color: #333; }',
		]),
	],
	'resize-text': [pair('is cut off', `<div style="height: 23px; overflow: hidden">${LONG}</div>`, `<div style="min-height: 23px">${LONG}</div>`)],
	reflow: [
		pair('runs past the window', '<div style="width: 600px">A wide box</div>', '<div style="max-width: 600px">A wide box</div>'),
		pair(
			'is cut off',
			'<div style="max-width: 100%; height: 23px; overflow: hidden">Camera 4, north entrance, online since this morning</div>',
			'<div style="max-width: 100%; min-height: 23px">Camera 4, north entrance, online since this morning</div>',
		),
	],
	'non-text-contrast': [
		pair('its edge is', '<input aria-label="Name" style="border: 1px solid #ddd; background: #fff">', '<input aria-label="Name" style="border: 1px solid #767676; background: #fff">'),
		pair(
			'its icon is',
			`<button aria-label="Close" style="background: #fff; border: 0; color: #ccc">${ICON.replace('<path', '<path fill="currentColor"')}</button>`,
			`<button aria-label="Close" style="background: #fff; border: 0; color: #555">${ICON.replace('<path', '<path fill="currentColor"')}</button>`,
		),
		pair('its focus indicator', '<button>Save</button>', '<button>Save</button>', [
			'button:focus { outline: 2px solid #e8e8e8; outline-offset: 2px; }',
			'button:focus { outline: 2px solid #1a4fa0; outline-offset: 2px; }',
		]),
	],
	'text-spacing': [
		pair(
			'is cut off',
			'<div style="width: 220px; height: 22px; overflow: hidden; line-height: 22px">Remember this device</div>',
			'<div style="width: 220px; min-height: 22px; line-height: 22px">Remember this device</div>',
		),
	],
	'hover-content': [
		pair('Escape does not dismiss it', `<span class="w">${TIP}</span>`, `<span class="w">${TIP}</span><script>document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelector('.tip').hidden = true; });</script>`, [
			'.tip { display: none; } .w:hover .tip { display: block; }',
			'.tip { display: none; } .w:hover .tip { display: block; } .tip[hidden] { display: none !important; }',
		]),
		pair(
			'goes when the pointer moves onto it',
			`${TIP}<script>document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelector('.tip').hidden = true; });</script>`,
			`<span class="w">${TIP}</span><script>document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelector('.tip').hidden = true; });</script>`,
			[
				'.tip { display: none; position: absolute; margin-top: 40px; } button:hover + .tip { display: block; } .tip[hidden] { display: none !important; }',
				'.tip { display: none; } .w:hover .tip { display: block; } .tip[hidden] { display: none !important; }',
			],
		),
		pair(
			'does not stay',
			`<span class="w">${TIP}</span><script>document.querySelector('.tip').addEventListener('mouseenter', () => setTimeout(() => (document.querySelector('.tip').hidden = true), 500)); document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelector('.tip').hidden = true; });</script>`,
			`<span class="w">${TIP}</span><script>document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.querySelector('.tip').hidden = true; });</script>`,
			[
				'.tip { display: none; } .w:hover .tip { display: block; } .tip[hidden] { display: none !important; }',
				'.tip { display: none; } .w:hover .tip { display: block; } .tip[hidden] { display: none !important; }',
			],
		),
	],
	'pause-stop-hide': [
		pair('plays for ever', '<span class="s">Loading</span>', '<span class="s">Loading</span>', [
			'@keyframes spin { to { transform: rotate(360deg); } } .s { display: inline-block; animation: spin 1s infinite; }',
			'@keyframes spin { to { transform: rotate(360deg); } } .s { display: inline-block; animation: spin 1s 2; }',
		]),
	],
	'target-size': [
		pair('within its 24-pixel circle', `${SMALL('')}<button style="width: 40px; height: 40px; padding: 0">B</button>`, `${SMALL('margin-right: 16px')}<button style="width: 40px; height: 40px; padding: 0">B</button>`),
		// Out of each other's reach, and their 24-pixel circles still meet: 7 pixels apart.
		pair('within its 24-pixel circle', `${SMALL('margin-right: 7px')}${SMALL('')}`, `${SMALL('margin-right: 10px')}${SMALL('')}`),
	],
	'on-input': [
		pair('opened a window', `<select aria-label="Camera" onchange="window.open('/elsewhere')"><option>One</option><option>Two</option></select>`, `<select aria-label="Camera" onchange="document.getElementById('o').textContent = this.value"><option>One</option><option>Two</option></select><p id="o"></p>`),
		pair(
			'replaced most of the page',
			`<h1>Cameras</h1><p>North entrance</p><p>South entrance</p><p>Car park</p><input aria-label="Filter" oninput="document.querySelector('main').innerHTML = '<h1>Results</h1>'">`,
			`<h1>Cameras</h1><p>North entrance</p><p>South entrance</p><p>Car park</p><input aria-label="Filter" oninput="document.getElementById('n').textContent = this.value"><p id="n"></p>`,
		),
	],
	'error-identification': [
		pair(
			'no field names it',
			`<form novalidate onsubmit="event.preventDefault(); document.getElementById('e').hidden = false"><label for="n">Name</label> <input id="n"> <span id="e" hidden>Name is required</span> <button>Send</button></form>`,
			`<form novalidate onsubmit="event.preventDefault(); document.getElementById('e').hidden = false"><label for="n">Name</label> <input id="n" aria-describedby="e"> <span id="e" hidden>Name is required</span> <button>Send</button></form>`,
		),
		pair(
			'names no message',
			`<form novalidate onsubmit="event.preventDefault(); document.getElementById('n').setAttribute('aria-invalid', 'true')"><label for="n">Name</label> <input id="n"> <button>Send</button></form>`,
			`<form novalidate onsubmit="event.preventDefault(); document.getElementById('n').setAttribute('aria-invalid', 'true'); document.getElementById('e').hidden = false"><label for="n">Name</label> <input id="n" aria-describedby="e"> <span id="e" hidden>Name is required</span> <button>Send</button></form>`,
		),
	],
	'status-messages': [
		pair(
			'outside any live region',
			`<button onclick="document.getElementById('m').textContent = 'Saved'">Save</button><p id="m"></p>`,
			`<button onclick="document.getElementById('m').textContent = 'Saved'">Save</button><p id="m" role="status"></p>`,
		),
	],
};

/** A web component: `name`, drawing `inner` in an open shadow root, with its own `css`, as a component library would. */
const component = (name: string, inner: string, css = '') =>
	`<${name}></${name}><script>customElements.define(${JSON.stringify(name)}, class extends HTMLElement { constructor() { super(); this.attachShadow({ mode: 'open' }).innerHTML = ${JSON.stringify(`<style>${css}</style>${inner}`)}; } });</script>`;
const TRAP = (escapeLetsOut: boolean) =>
	`<script>document.getElementById('trap').addEventListener('keydown', (e) => { if (e.key === 'Tab') e.preventDefault(); if (e.key === 'Escape') ${escapeLetsOut ? "document.getElementById('last').focus()" : 'e.preventDefault()'}; });</script>`;

/**
 * Pages built other ways (web components, frames, colors written as \`oklch()\`), and twins of false findings the probe once
 * made: each cell's planted defect again, and a twin that must stay clean however it is built.
 */
const OTHER_WAYS: Partial<Record<CellId, Fixture[]>> = {
	'keyboard-trap': [
		// Three stops inside one web component are three stops, not a trap.
		pair(
			'never leaves them',
			`${component('x-tools', '<button>A</button><button>B</button><button>C</button>')}<input id="trap" aria-label="Name"><button id="last">Last</button>${TRAP(false)}`,
			`${component('x-tools', '<button>A</button><button>B</button><button>C</button>')}<input aria-label="Name"><button id="last">Last</button>`,
		),
		// Escape that lets focus out is a way out.
		pair('never leaves them', `<input id="trap" aria-label="Name"><button id="last">Last</button>${TRAP(false)}`, `<input id="trap" aria-label="Name"><button id="last">Last</button>${TRAP(true)}`),
	],
	'focus-visible': [
		pair('drawn as it is when not', component('x-save', '<button>Save</button>', 'button:focus { outline: none; }'), component('x-save', '<button>Save</button>')),
		pair(
			'drawn as it is when not',
			`<iframe title="Payment" srcdoc="${'<style>button:focus { outline: none; }</style><button>Pay</button>'.replace(/"/g, '&quot;')}"></iframe>`,
			'<iframe title="Payment" srcdoc="<button>Pay</button>"></iframe>',
		),
	],
	'keyboard-reach': [
		// An item a menu reaches by its arrow keys is reached; the same item on its own is not.
		pair(
			'looks clickable',
			`<div tabindex="-1" style="cursor: pointer" onclick="this.textContent = 'Done'">Archive</div>`,
			`<div role="menu"><div role="menuitem" tabindex="0">Open</div><div role="menuitem" tabindex="-1" style="cursor: pointer">Archive</div></div>`,
		),
		pair('looks clickable', component('x-row', '<div style="cursor: pointer">Delete</div>'), component('x-row', '<button>Delete</button>')),
	],
	'color-only': [
		pair(
			'forced colors paints it over',
			'<p><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: oklch(0.6 0.2 25)"></span> Camera 4</p>',
			'<p><span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: oklch(0.6 0.2 25); border: 2px solid oklch(0.6 0.2 25)"></span> Camera 4</p>',
		),
	],
	'non-text-contrast': [
		pair('its edge is', '<input aria-label="Name" style="border: 1px solid oklch(0.92 0 0); background: #fff">', '<input aria-label="Name" style="border: 1px solid oklch(0.45 0 0); background: #fff">'),
		// A field whose edge its frame draws, as an outlined field often is.
		pair(
			'its edge is',
			'<div style="display: inline-block; border: 1px solid #ddd; border-radius: 4px"><input aria-label="Name" style="border: 0; outline: 0; background: transparent"></div>',
			'<div style="display: inline-block; border: 1px solid #767676; border-radius: 4px"><input aria-label="Name" style="border: 0; outline: 0; background: transparent"></div>',
		),
	],
	'contrast-states': [
		// Text already too faint as the page opens is axe's: focus making it no worse is not this cell's.
		pair('on focus', '<button>Save</button>', '<button>Save</button>', [
			'button { color: #000; background: #fff; border: 1px solid #000; } button:focus { color: #ccc; }',
			'button { color: #ccc; background: #fff; border: 1px solid #000; } button:focus { color: #ccc; }',
		]),
	],
	'on-input': [
		pair(
			'went to another address',
			`<select aria-label="Camera" onchange="location.href = '/elsewhere'"><option>One</option><option>Two</option></select>`,
			`<select aria-label="Camera" onchange="document.getElementById('o').textContent = this.value"><option>One</option><option>Two</option></select><p id="o"></p>`,
		),
		pair(
			'opened a dialog',
			`<select aria-label="Camera" onchange="document.getElementById('d').show()"><option>One</option><option>Two</option></select><dialog id="d"><p>Pick one</p></dialog>`,
			`<select aria-label="Camera" onchange="document.getElementById('o').textContent = this.value"><option>One</option><option>Two</option></select><p id="o"></p>`,
		),
	],
	'error-identification': [
		// The browser's own check, which names the field and says what is wrong: counted as named.
		pair(
			'no field names it',
			`<form novalidate onsubmit="event.preventDefault(); document.getElementById('e').hidden = false"><label for="n">Name</label> <input id="n" required> <span id="e" hidden>Name is required</span> <button>Send</button></form>`,
			`<form onsubmit="event.preventDefault(); document.getElementById('e').hidden = false"><label for="n">Name</label> <input id="n" required> <span id="e" hidden>Name is required</span> <button>Send</button></form>`,
		),
	],
	'status-messages': [
		// A clock ticking in place, a button that opens what it names, a button whose own label changes: none is a message.
		pair(
			'outside any live region',
			`<p id="t">0</p><button onclick="document.getElementById('m').textContent = 'Saved'">Save</button><p id="m"></p><script>setInterval(() => (document.getElementById('t').firstChild.data = String(Date.now())), 100);</script>`,
			`<p id="t">0</p><button onclick="this.textContent = 'Show fewer'">Show more</button><button aria-expanded="false" aria-controls="m" onclick="this.setAttribute('aria-expanded', 'true'); document.getElementById('m').textContent = 'More'">More</button><p id="m"></p><script>setInterval(() => (document.getElementById('t').firstChild.data = String(Date.now())), 100);</script>`,
		),
	],
};
for (const [cell, more] of Object.entries(OTHER_WAYS) as [CellId, Fixture[]][]) PROBE_FIXTURES[cell] = [...(PROBE_FIXTURES[cell] ?? []), ...more];

/**
 * The source cells' fixtures: lines with a planted defect, each in one of the forms a product's source writes it (a DOM
 * listener, a JSX prop, CSS), and clean twins, each differing by one thing its rule looks at.
 */
export const SOURCE_FIXTURES: Partial<Record<CellId, { bad: string[]; good: string[] }>> = {
	'key-shortcuts': {
		bad: ["document.addEventListener('keydown', (e) => {\n\tif (e.key === 'k') openSearch();\n});", "if ('?' === event.key) showHelp();", '<input @keydown.k="openSearch" />'],
		good: [
			"document.addEventListener('keydown', (e) => {\n\tif (e.key === 'k' && (e.metaKey || e.ctrlKey)) openSearch();\n});",
			"if (e.key === 'Enter') send();",
			'<input @keydown.ctrl.k="openSearch" />',
		],
	},
	timing: { bad: ['setTimeout(signOut, 15 * 60 * 1000);', 'setInterval(refresh, 30_000);'], good: ['setTimeout(hideToast, 4000);', 'const limit = 15 * 60 * 1000;'] },
	flashing: { bad: ['.alert { animation: blink 0.2s infinite; }', '.alert { animation: blink 150ms linear infinite; }'], good: ['.alert { animation: blink 0.2s 3; }', '.alert { animation: blink 2s infinite; }'] },
	'pointer-gestures': {
		bad: ['if (e.touches.length === 2) zoom(e);', "el.addEventListener('touchmove', pan);", '<div onTouchMove={pan} />', "el.addEventListener('gesturestart', pinch);", '<div @touchmove="pan" />', '<div (touchmove)="pan($event)"></div>'],
		good: ["el.addEventListener('click', zoomIn);", '<div onTouchEnd={tap} />'],
	},
	'pointer-cancellation': {
		bad: [
			'<button onMouseDown={remove}>Remove</button>',
			"el.addEventListener('pointerdown', remove);",
			'<li onTouchStart={pick} />',
			"el.addEventListener('touchstart', pick);",
			'<button @mousedown="remove">Remove</button>',
			'<button v-on:pointerdown="remove">Remove</button>',
			'<button on:mousedown={remove}>Remove</button>',
			'<button (mousedown)="remove()">Remove</button>',
		],
		good: ['<button onClick={remove}>Remove</button>', "el.addEventListener('pointerup', remove);", '<button @click="remove">Remove</button>', 'const trackMousedownCount = 0;'],
	},
	'motion-actuation': {
		bad: ["window.addEventListener('devicemotion', undo);", 'if (window.DeviceOrientationEvent) tilt();', 'const sensor = new Accelerometer();'],
		good: ["window.addEventListener('resize', layout);"],
	},
	dragging: {
		bad: ['<li draggable onClick={open}>Camera 4</li>', '<li onDragStart={pick}>Camera 4</li>', "el.addEventListener('dragstart', pick);", '<li v-on:dragstart="pick">Camera 4</li>', '<li on:dragstart={pick}>Camera 4</li>'],
		good: ['<li>Camera 4 <button onClick={moveUp}>Move up</button></li>'],
	},
};
