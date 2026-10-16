/**
 * Where a value of a component's own is written in the library's source (Phase 4 of adjusting a component,
 * DESIGN_SYSTEM_PLAN.md), **found by its effect**, since the browser cannot say: what is drawn is hashed classes and
 * literals, with no address and no source maps. Every place the drawn value is written, in the design system's own files,
 * in any of the ways it may be (`28px`, `1.75rem`, `28` in a style object; a colour as hex, `rgb()` or its name), is a
 * candidate; each is changed alone, on a build kept open for it, to a value of DSNR's own (`probeFor`), and the component's
 * instances drawn again: the places that move them are where the value is written. A text search alone would say what is
 * not so (FUI's `8px` is written in 19 places, none of them FSButton's radius).
 *
 * This module is what is the same for every library: which files are searched, the ways a value is written, and how a
 * new value is written in the way it was. What draws and measures is `ValueSources` (`valueSources.ts`).
 */
import type { ValueProperty } from '../../shared/contract';
import { COLOR_VALUES } from '../../shared/contract';
import { hexOf } from '../../shared/tokens';

/** The files a value may be written in: scripts and stylesheets. */
const SEARCHED = /\.(?:[cm]?[jt]sx?|css|scss|sass|less)$/;
/** What is not the design system's code: its stories, tests and docs, its Storybook set-up, and what is built or generated. */
const SKIPPED =
	/(?:^|\/)(?:\.storybook|__tests__|__snapshots__|__mocks__|node_modules|dist|build|coverage|e2e)\/|\.(?:stories|test|spec|figma|docs)\.[^/]+$|\.d\.ts$/;

/** Of the design system's files, those a value of a component's own may be written in. */
export const searchedFiles = (files: string[]): string[] => files.filter((f) => SEARCHED.test(f) && !SKIPPED.test(f));

/** How a value is written in a place: a length in px or rem, a bare number (a style object's px), a percent, a colour. */
export type Form = 'px' | 'rem' | 'number' | 'percent' | 'hex' | 'rgb' | 'name';

/** A place in the design system's files where a drawn value is written, as it is written there. */
export interface Place {
	file: string;
	/** Where it starts in the file's text, and its line, from 1. */
	at: number;
	line: number;
	written: string;
	form: Form;
}

const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A number as CSS writes it, shortest: `1.75`, `0.625`, `28`. */
const numeral = (n: number): string => String(Number(n.toFixed(4)));

/** A drawn colour as its channels and alpha, from the browser's `rgb()` or `rgba()`, or a hex. */
const channels = (color: string): { r: number; g: number; b: number; a: number } | null => {
	const hex = hexOf(color);
	if (hex === null) return null;
	const byte = (i: number) => parseInt(hex.slice(i, i + 2), 16);
	return { r: byte(1), g: byte(3), b: byte(5), a: hex.length === 9 ? byte(7) / 255 : 1 };
};

/** The ways a drawn part (`28px`, `50%`, `rgb(16, 128, 98)`) may be written in a script or a stylesheet. */
const formsOf = (property: ValueProperty, part: string, script: boolean): { form: Form; pattern: RegExp }[] => {
	if (COLOR_VALUES.has(property)) {
		const c = channels(part);
		if (c === null) return [];
		const hex = (hexOf(part) as string).slice(1, 7).toLowerCase();
		const alpha = c.a === 1 ? '' : (hexOf(part) as string).slice(7).toLowerCase();
		const short = hex[0] === hex[1] && hex[2] === hex[3] && hex[4] === hex[5] ? `${hex[0]}${hex[2]}${hex[4]}` : null;
		const shortAlpha = alpha === '' ? '' : alpha[0] === alpha[1] ? (alpha[0] as string) : null;
		const a =
			c.a === 1 ? '(?:\\s*[,/]\\s*(?:1|1\\.0+|100%))?' : `\\s*[,/]\\s*(?:0?${escaped(numeral(c.a).replace(/^0/, ''))}|${numeral(c.a * 100)}%)`;
		const forms: { form: Form; pattern: RegExp }[] = [
			{ form: 'hex', pattern: new RegExp(`#${hex}${alpha === '' ? '(?:ff)?' : alpha}(?![0-9a-f])`, 'gi') },
			{ form: 'rgb', pattern: new RegExp(`rgba?\\(\\s*${c.r}\\s*,?\\s*${c.g}\\s*,?\\s*${c.b}${a}\\s*\\)`, 'g') },
		];
		if (short !== null && shortAlpha !== null) forms.push({ form: 'hex', pattern: new RegExp(`#${short}${shortAlpha}(?![0-9a-f])`, 'gi') });
		const name = c.a !== 1 ? null : c.r + c.g + c.b === 765 ? 'white' : c.r + c.g + c.b === 0 ? 'black' : null;
		if (name !== null) forms.push({ form: 'name', pattern: new RegExp(`(?<![\\w-])${name}(?![\\w-])`, 'g') });
		return forms;
	}
	const percent = /^(-?[\d.]+)%$/.exec(part);
	if (percent) return [{ form: 'percent', pattern: new RegExp(`(?<![\\w.$-])${escaped(numeral(Number(percent[1])))}%`, 'g') }];
	const px = /^(-?[\d.]+)px$/.exec(part);
	if (!px) return [];
	const n = Number(px[1]);
	const whole = escaped(numeral(n));
	const forms: { form: Form; pattern: RegExp }[] = [{ form: 'px', pattern: new RegExp(`(?<![\\w.$-])${whole}px(?![\\w-])`, 'g') }];
	if (n !== 0) {
		const rem = numeral(n / 16);
		if (Number(rem) * 16 === n)
			forms.push({ form: 'rem', pattern: new RegExp(`(?<![\\w.$-])0?${escaped(rem.replace(/^0(?=\.)/, ''))}rem(?![\\w-])`, 'g') });
	}
	// A style object's number is px (`height: 28`): in a script, as a property's value.
	if (script) forms.push({ form: 'number', pattern: new RegExp(`(?<=:\\s*)${whole}(?=\\s*[,}\\n\\r])`, 'g') });
	return forms;
};

/** Every place a drawn part is written in a file, in any of its ways, in the order they come. */
export const placesIn = (file: string, text: string, property: ValueProperty, part: string): Place[] => {
	const script = /\.[cm]?[jt]sx?$/.test(file);
	const found: Place[] = [];
	for (const { form, pattern } of formsOf(property, part, script)) {
		for (const m of text.matchAll(pattern)) {
			const at = m.index ?? 0;
			found.push({ file, at, line: text.slice(0, at).split('\n').length, written: m[0], form });
		}
	}
	return found.sort((a, b) => a.at - b.at);
};

/**
 * A part's new value (as CSS writes it: `32px`, `#C80000`, `rgb(200, 0, 0)`) written the way the place writes its value:
 * a px as px, a rem as rem, a style object's number as a number, a colour as hex or `rgb()` as it was, and a named colour
 * as hex. Null when it cannot be written so: a length given as a colour, or a rem that is not a whole px.
 */
export const writtenAs = (place: Place, value: string): string | null => {
	if (place.form === 'hex' || place.form === 'rgb' || place.form === 'name') {
		const c = channels(value);
		if (c === null) return null;
		if (place.form === 'rgb') return c.a === 1 ? `rgb(${c.r}, ${c.g}, ${c.b})` : `rgba(${c.r}, ${c.g}, ${c.b}, ${numeral(c.a)})`;
		const hex = hexOf(value) as string;
		const lower = place.written === place.written.toLowerCase();
		return lower ? hex.toLowerCase() : hex;
	}
	const unit = place.form === 'percent' ? '%' : 'px';
	const m = new RegExp(`^(-?[\\d.]+)${unit}$`).exec(value);
	if (!m) return null;
	const n = Number(m[1]);
	if (place.form === 'percent') return `${numeral(n)}%`;
	if (place.form === 'px') return `${numeral(n)}px`;
	if (place.form === 'number') return numeral(n);
	return `${numeral(n / 16)}rem`;
};

/** A file's text with `places` given new text (`literal` for each), each in its place: from the end, so none moves another. */
export const withWrites = (text: string, writes: { place: Place; literal: string }[]): string =>
	[...writes]
		.sort((a, b) => b.place.at - a.place.at)
		.reduce((t, { place, literal }) => t.slice(0, place.at) + literal + t.slice(place.at + place.written.length), text);

/** A value of DSNR's own a place is changed to, to see whether it moves the component: never the value drawn. */
export const probeFor = (property: ValueProperty, part: string): string => {
	if (COLOR_VALUES.has(property)) return hexOf(part)?.slice(0, 7) === '#123457' ? '#654321' : '#123457';
	const m = /^(-?[\d.]+)(px|%)$/.exec(part);
	return m ? `${numeral(Number(m[1]) + 7)}${m[2]}` : part;
};
