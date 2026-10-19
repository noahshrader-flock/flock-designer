/**
 * Places are found by their effect, since the browser cannot say (hashed classes, no source maps): a text search alone
 * misleads (FUI's `8px` is in 19 places, none FSButton's radius).
 */
import type { ValueProperty } from '../../../shared/contract';
import { COLOR_VALUES } from '../../../shared/contract';
import { PX_PER_REM, hexOf } from '../../../shared/tokens';
import { inGeneratedFolder } from '../../../shared/generatedFolders';

const SEARCHED = /\.(?:[cm]?[jt]sx?|css|scss|sass|less)$/;
const SKIPPED = /(?:^|\/)(?:\.storybook|__tests__|__snapshots__|__mocks__|e2e)\/|\.(?:stories|test|spec|figma|docs)\.[^/]+$|\.d\.ts$/;
const skipped = (path: string): boolean => inGeneratedFolder(path) || SKIPPED.test(path);

export const searchedFiles = (files: string[]): string[] => files.filter((f) => SEARCHED.test(f) && !skipped(f));

/** `number` is a bare number, which a style object reads as px. */
export type Form = 'px' | 'rem' | 'number' | 'percent' | 'hex' | 'rgb' | 'name';

export interface Place {
	file: string;
	/** `at` is an offset into the file's text; `line` counts from 1. */
	at: number;
	line: number;
	written: string;
	form: Form;
	/** Px per rem where it is drawn: the page's root font size. */
	perRem: number;
}

const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const numeral = (n: number): string => String(Number(n.toFixed(4)));

const channels = (color: string): { r: number; g: number; b: number; a: number } | null => {
	const hex = hexOf(color);
	if (hex === null) return null;
	const byte = (i: number) => parseInt(hex.slice(i, i + 2), 16);
	return { r: byte(1), g: byte(3), b: byte(5), a: hex.length === 9 ? byte(7) / 255 : 1 };
};

const formsOf = (property: ValueProperty, part: string, script: boolean, perRem: number): { form: Form; pattern: RegExp }[] => {
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
		const rem = numeral(n / perRem);
		if (Number(rem) * perRem === n)
			forms.push({ form: 'rem', pattern: new RegExp(`(?<![\\w.$-])0?${escaped(rem.replace(/^0(?=\.)/, ''))}rem(?![\\w-])`, 'g') });
	}
	// A style object's number is px (`height: 28`), and so is a prop's (`height={28}`): in a script.
	if (script) forms.push({ form: 'number', pattern: new RegExp(`(?<=(?::|=\\{)\\s*)${whole}(?=\\s*[,}\\n\\r])`, 'g') });
	return forms;
};

export const searchable = (property: ValueProperty, part: string): boolean => formsOf(property, part, true, 16).length > 0;

export const placesIn = (file: string, text: string, property: ValueProperty, part: string, perRem = PX_PER_REM): Place[] => {
	const script = /\.[cm]?[jt]sx?$/.test(file);
	const found: Place[] = [];
	for (const { form, pattern } of formsOf(property, part, script, perRem)) {
		for (const m of text.matchAll(pattern)) {
			const at = m.index ?? 0;
			found.push({ file, at, line: text.slice(0, at).split('\n').length, written: m[0], form, perRem });
		}
	}
	return found.sort((a, b) => a.at - b.at);
};

/** A named colour is written as hex. Null when it cannot be written in the place's form, such as a length given as a colour. */
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
	return `${numeral(n / place.perRem)}rem`;
};

/** Null when `value` cannot be written in `written`'s form. */
export const writtenLike = (written: string, value: string, perRem = PX_PER_REM): string | null => {
	const form: Form = /^#/.test(written)
		? 'hex'
		: /^rgba?\(/.test(written)
			? 'rgb'
			: /rem$/.test(written)
				? 'rem'
				: /%$/.test(written)
					? 'percent'
					: /^-?[\d.]+$/.test(written)
						? 'number'
						: 'px';
	return writtenAs({ file: '', at: 0, line: 0, written, form, perRem }, value);
};

/** Written from the end, so no write moves another's offset. */
export const withWrites = (text: string, writes: { place: Place; literal: string }[]): string =>
	[...writes]
		.sort((a, b) => b.place.at - a.place.at)
		.reduce((t, { place, literal }) => t.slice(0, place.at) + literal + t.slice(place.at + place.written.length), text);

/** Never the value drawn, or the probe would not move the component. */
export const probeFor = (property: ValueProperty, part: string): string => {
	if (COLOR_VALUES.has(property)) return hexOf(part)?.slice(0, 7) === '#123457' ? '#654321' : '#123457';
	const m = /^(-?[\d.]+)(px|%)$/.exec(part);
	return m ? `${numeral(Number(m[1]) + 7)}${m[2]}` : part;
};
