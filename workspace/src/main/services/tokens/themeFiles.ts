/**
 * Tokens kept as a JavaScript or TypeScript theme, as MUI libraries keep them (FUI among them). **Found by their shape,
 * not by where they are:** a tone family is an exported object of numbered steps with hex colors (`pineGreen = { 50:
 * '#108062', … }`), a palette is an exported object with a `mode` (`lightPalette = { mode: 'light', primary: { main:
 * pineGreen[50] } }`), and the theme's spacing and radius are its `spacing` and its `shape.borderRadius`. Only files
 * whose path says colors, tokens, themes, palettes or tones are read; any other object in them is left alone.
 *
 * **A change is written as the library writes it** (decision 26): a tone step's hex as a quoted hex, a role pointed at
 * another step of its tone as `pineGreen[60]` (with its opacity, as before), a role given its own color as a quoted hex,
 * and the spacing or radius as its number of pixels.
 */
import type { DesignToken, TokenProblem } from '../../../shared/contract';
import { type Entry, entryAt, exportedObjects, lineAt, literal, parseObject, replaced } from './objectLiteral';
import { primitiveOf } from '../../../shared/primitives';
import { type TokenSource, capitalized, notWhereRead, semanticFirst } from './source';

const SCRIPT = /\.(ts|tsx|js|jsx|mjs)$/;
const THEME_PATH = /(^|\/)(colou?rs?|tokens?|themes?|palettes?|tones?)(\/|\.|$)/i;
const HEX = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A color as a palette writes it: a tone step (`pineGreen[50]`), the same with an opacity after it, or a hex. */
const colorOf = (text: string, tones: Map<string, Map<string, string>>): { value: string; ref?: DesignToken['ref'] } | string => {
	const hex = literal(text);
	if (hex !== null && HEX.test(hex)) return { value: hex.toUpperCase() };
	const m = /^(?:(\w+)\[(\d+)\]|`\$\{(\w+)\[(\d+)\]\}([0-9a-fA-F]{2})`)$/.exec(text);
	if (!m) return `${text} is not a tone step, a tone step with an opacity, or a hex, so it is not read`;
	const [tone, step, alpha] = m[1] ? [m[1], m[2] as string, undefined] : [m[3] as string, m[4] as string, m[5]];
	const value = tones.get(tone)?.get(step);
	if (value === undefined) return `${text} points at a tone step the library does not have`;
	const path = `tone.${tone}.${step}`;
	return { value: alpha ? `${value}${alpha.toUpperCase()}` : value, ref: alpha ? { path, alpha } : { path } };
};

/** An object of numbered steps, at least one of them a hex color: a tone family. */
const isTones = (entries: Entry[]): boolean =>
	entries.length > 0 &&
	entries.every((e) => e.key !== null && /^\d+$/.test(e.key)) &&
	entries.some((e) => e.value.kind === 'value' && HEX.test(literal(e.value.text) ?? ''));

/** An object's `mode` (`mode: 'light' as PaletteMode`), which makes it a palette. */
const modeOf = (entries: Entry[]): string | null => {
	const mode = entries.find((e) => e.key === 'mode')?.value;
	return mode?.kind === 'value' ? (/^(['"])(\w+)\1/.exec(mode.text)?.[2] ?? null) : null;
};

/** The theme's numbers the panel shows, by token path: the key a theme sets each with, and the object it is set in. */
const THEME_NUMBERS: { path: string; key: string; inside: RegExp }[] = [
	{ path: 'spacing', key: 'spacing', inside: /createTheme\(\s*\{/ },
	{ path: 'radius', key: 'borderRadius', inside: /\bshape\b[^={]*[=:]\s*\{/ },
];

/**
 * A whole number a theme sets: `const spacing = 8;`, or `spacing: 8` in `createTheme({ … })`; with its line, and where
 * the number is written.
 */
const themeNumber = (text: string, { key, inside }: (typeof THEME_NUMBERS)[number]): { value: string; line: number; span: [number, number] } | null => {
	const constant = new RegExp(`\\bconst\\s+${key}\\s*=\\s*(\\d+)\\s*;`).exec(text);
	if (constant) {
		const at = constant.index + (constant[0].length - constant[0].replace(/^.*?=\s*/, '').length);
		return { value: constant[1] as string, line: lineAt(text, constant.index), span: [at, at + (constant[1] as string).length] };
	}
	const open = inside.exec(text);
	if (!open) return null;
	const { node } = parseObject(text, open.index + open[0].length - 1);
	const entry = node.kind === 'object' ? node.entries.find((e) => e.key === key) : undefined;
	const value = entry?.value.kind === 'value' ? /^\d+$/.exec(entry.value.text)?.[0] : undefined;
	return value && entry ? { value, line: entry.line, span: entry.span } : null;
};

export const themeFiles: TokenSource = {
	name: 'theme files',
	read: async (reads, files) => {
		const tokens: DesignToken[] = [];
		const problems: TokenProblem[] = [];
		const texts = new Map<string, string>();
		for (const file of files.filter((f) => SCRIPT.test(f) && THEME_PATH.test(f)).sort()) {
			const text = await reads.readFile(file).catch(() => null);
			if (text === null) problems.push({ file, reason: `${file} could not be read` });
			else texts.set(file, text);
		}
		const objects = new Map<string, { file: string; entries: Entry[] }>();
		for (const [file, text] of texts) for (const [name, entries] of exportedObjects(text)) objects.set(name, { file, entries });

		// The tone families, each step with its color, in the file's order.
		const tones = new Map<string, Map<string, string>>();
		for (const [name, { file, entries }] of objects) {
			if (!isTones(entries)) continue;
			const steps = new Map<string, string>();
			for (const e of entries) {
				const hex = e.value.kind === 'value' ? literal(e.value.text) : null;
				if (hex === null || !HEX.test(hex)) {
					const written = e.value.kind === 'value' ? e.value.text : 'an object';
					problems.push({ file, line: e.line, reason: `${name} ${e.key} is ${written}, not a hex color, so this step is not read` });
					continue;
				}
				steps.set(e.key as string, hex.toUpperCase());
				tokens.push({ path: `tone.${name}.${e.key}`, kind: 'color', category: primitiveOf('color', name) as string, group: 'Tones', set: name, name: e.key as string, value: hex.toUpperCase(), source: { file, line: e.line } });
			}
			tones.set(name, steps);
		}

		// Each palette object's roles, resolved once: one both modes spread in is read, and its problems said, once.
		type Role = Omit<DesignToken, 'path' | 'category' | 'group'>;
		const resolved = new Map<string, Role[]>();
		const rolesOf = (name: string, seen: Set<string> = new Set()): Role[] => {
			const done = resolved.get(name);
			if (done) return done;
			const object = objects.get(name);
			if (!object || seen.has(name)) return [];
			seen.add(name);
			const roles: Role[] = [];
			for (const e of object.entries) {
				if (e.spread !== undefined) {
					if (objects.has(e.spread)) roles.push(...rolesOf(e.spread, seen));
					else problems.push({ file: object.file, line: e.line, reason: `...${e.spread} is not a palette the library exports` });
					continue;
				}
				if (e.key === 'mode') continue;
				if (e.value.kind !== 'object') {
					problems.push({ file: object.file, line: e.line, reason: `${e.key}: a role is an object of colors, so it is not read` });
					continue;
				}
				for (const v of e.value.entries) {
					const color = v.value.kind === 'value' ? colorOf(v.value.text, tones) : `${v.key}: an object where a color belongs`;
					if (typeof color === 'string') {
						problems.push({ file: object.file, line: v.line, reason: color });
						continue;
					}
					roles.push({ kind: 'color', set: e.key as string, name: v.key as string, ...color, source: { file: object.file, line: v.line } });
				}
			}
			resolved.set(name, roles);
			return roles;
		};
		// A palette is an object with a mode; light first, as a person reads them.
		const palettes = [...objects]
			.map(([name, { entries }]) => ({ name, mode: modeOf(entries) }))
			.filter((p): p is { name: string; mode: string } => p.mode !== null)
			.sort((a, b) => (a.mode === 'light' ? -1 : b.mode === 'light' ? 1 : a.mode.localeCompare(b.mode)));
		for (const { name, mode } of palettes) {
			for (const r of rolesOf(name)) tokens.push({ path: `palette.${mode}.${r.set}.${r.name}`, category: primitiveOf('color', r.name) as string, group: capitalized(mode), ...r });
		}
		if (tones.size === 0 && palettes.length === 0) return null;

		// The theme's base spacing and radius, in pixels, from the first file that sets them.
		for (const number of THEME_NUMBERS) {
			const name = number.path;
			for (const [file, text] of texts) {
				const found = themeNumber(text, number);
				if (!found) continue;
				tokens.push({ path: name, kind: 'dimension', category: primitiveOf('dimension', name) as string, group: capitalized(name), set: name, name: 'base', value: `${found.value}px`, source: { file, line: found.line } });
				break;
			}
		}
		// The tones are the primitives the palettes are made from: after them.
		return { source: themeFiles.name, tokens: semanticFirst(tokens, (t) => t.group === 'Tones'), problems };
	},

	edit: (text, token, to) => {
		if (token.kind === 'dimension') {
			const number = THEME_NUMBERS.find((n) => n.path === token.path);
			const found = number && themeNumber(text, number);
			if (!found || found.line !== token.source.line) throw notWhereRead(token);
			const px = 'value' in to ? /^(\d+)px$/.exec(to.value)?.[1] : undefined;
			if (px === undefined) throw new Error(`The theme sets ${token.path} as a whole number of pixels, so it cannot be ${'value' in to ? to.value : 'a pointer'}.`);
			return replaced(text, found.span, px);
		}
		const entry = entryAt(text, token.name, token.source.line);
		if (!entry || entry.value.kind !== 'value') throw notWhereRead(token);
		if ('value' in to) return replaced(text, entry.span, `'${to.value.toUpperCase()}'`);
		// A role points at a tone step; the tone must already be in the file, which is what makes it reachable there.
		const step = /^tone\.(\w+)\.(\d+)$/.exec(to.ref);
		if (!step) throw new Error(`${token.path} can point only at a tone step, not at ${to.ref}.`);
		const [tone, at] = [step[1] as string, step[2] as string];
		if (!new RegExp(`\\b${tone}\\b`).test(text)) throw new Error(`${token.source.file} does not use ${tone}, so ${token.path} cannot point at it there.`);
		const alpha = token.ref?.alpha;
		return replaced(text, entry.span, alpha ? `\`\${${tone}[${at}]}${alpha}\`` : `${tone}[${at}]`);
	},
};
