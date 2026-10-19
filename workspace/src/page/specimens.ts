/**
 * Drawn in the preview page, not the panel's, because only that page has the design system's fonts. A family that is
 * missing is said to be, so a fallback is never taken for the real one.
 */
import type { SpecimenLine } from '../shared/catalog';

const SAMPLE = 'The quick brown fox jumps over the lazy dog';
const GENERIC = new Set([
	'serif',
	'sans-serif',
	'monospace',
	'cursive',
	'fantasy',
	'system-ui',
	'ui-serif',
	'ui-sans-serif',
	'ui-monospace',
	'ui-rounded',
	'emoji',
	'math',
	'fangsong',
]);
const first = (family: string) => (family.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');

// Large, so two families' widths differ by whole pixels: a measure, not a size anyone sees.
const PROBE_PX = 72;

const there = (family: string): boolean => {
	if (GENERIC.has(family)) return true;
	const probe = (fallback: string) => {
		const s = document.createElement('span');
		s.textContent = 'mmmmmmmmmmlli10WQ@';
		s.style.cssText = `position:absolute;visibility:hidden;font-size:${PROBE_PX}px;white-space:nowrap`;
		s.style.fontFamily = fallback;
		document.body.append(s);
		const plain = s.offsetWidth;
		s.style.fontFamily = `${JSON.stringify(family)}, ${fallback}`;
		const own = s.offsetWidth;
		s.remove();
		return plain !== own;
	};
	return probe('monospace') || probe('serif');
};

const element = (tag: string, className: string, text?: string): HTMLElement => {
	const e = document.createElement(tag);
	if (className) e.className = className;
	if (text !== undefined) e.textContent = text;
	return e;
};

export const drawSpecimens = async (lines: SpecimenLine[], into?: HTMLElement): Promise<void> => {
	const page = into ?? document.body.appendChild(document.createElement('div'));
	page.replaceChildren();
	const drawn = lines.map((line) => {
		const section = element('section', 'fd-story');
		section.dataset.specimen = line.key;
		const said = [line.label, line.size, line.weight && `weight ${line.weight}`, line.lineHeight && `line height ${line.lineHeight}`];
		const sample = element('p', '', SAMPLE);
		sample.dataset.sample = '';
		sample.style.margin = '0';
		if (line.family) sample.style.fontFamily = line.family;
		if (line.size) sample.style.fontSize = line.size;
		if (line.weight) sample.style.fontWeight = line.weight;
		if (line.lineHeight) sample.style.lineHeight = line.lineHeight;
		section.append(element('h4', 'fd-name', said.filter(Boolean).join(' · ')), sample);
		page.append(section);
		return { line, section };
	});
	if (document.fonts) await document.fonts.ready;
	for (const { line, section } of drawn) {
		const family = line.family && first(line.family);
		if (family && !there(family)) section.append(element('p', 'fd-name', `${family} is not available here: shown in a fallback.`));
	}
};
