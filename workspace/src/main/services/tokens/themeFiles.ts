/**
 * Tokens kept as a JavaScript or TypeScript theme, as MUI libraries keep them (FUI among them). **Found by their shape,
 * not by where they are:** a tone family is an exported object of numbered steps with hex colors (`pineGreen = { 50:
 * '#108062', … }`), a palette is an exported object with a `mode` (`lightPalette = { mode: 'light', primary: { main:
 * pineGreen[50] } }`), and the theme's spacing and radius are its `spacing` and its `shape.borderRadius`. Only files
 * whose path says colors, tokens, themes, palettes or tones are read; any other object in them is left alone.
 */
import type { DesignToken, TokenProblem } from '../../../shared/contract';
import { type Entry, exportedObjects, lineAt, literal, parseObject } from './objectLiteral';
import { type TokenSource, capitalized, categoryOf } from './source';

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
	return { value: alpha ? `${value}${alpha.toUpperCase()}` : value, ref: alpha ? { tone, step, alpha } : { tone, step } };
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

/** A whole number a theme sets: `const spacing = 8;`, or `spacing: 8` in `createTheme({ … })`; with its line. */
const themeNumber = (text: string, key: string, inside: RegExp): { value: string; line: number } | null => {
	const constant = new RegExp(`\\bconst\\s+${key}\\s*=\\s*(\\d+)\\s*;`).exec(text);
	if (constant) return { value: constant[1] as string, line: lineAt(text, constant.index) };
	const open = inside.exec(text);
	if (!open) return null;
	const { node } = parseObject(text, open.index + open[0].length - 1);
	const entry = node.kind === 'object' ? node.entries.find((e) => e.key === key) : undefined;
	const value = entry?.value.kind === 'value' ? /^\d+$/.exec(entry.value.text)?.[0] : undefined;
	return value && entry ? { value, line: entry.line } : null;
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
				tokens.push({ path: `tone.${name}.${e.key}`, kind: 'color', category: 'Color', group: 'Tones', set: name, name: e.key as string, value: hex.toUpperCase(), source: { file, line: e.line } });
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
			for (const r of rolesOf(name)) tokens.push({ path: `palette.${mode}.${r.set}.${r.name}`, category: 'Color', group: capitalized(mode), ...r });
		}
		if (tones.size === 0 && palettes.length === 0) return null;

		// The theme's base spacing and radius, in pixels, from the first file that sets them.
		const theme: [string, RegExp][] = [
			['spacing', /createTheme\(\s*\{/],
			['radius', /\bshape\b[^={]*[=:]\s*\{/],
		];
		for (const [name, inside] of theme) {
			for (const [file, text] of texts) {
				const found = themeNumber(text, name === 'radius' ? 'borderRadius' : name, inside);
				if (!found) continue;
				tokens.push({ path: name, kind: 'dimension', category: categoryOf('dimension', name) as string, group: capitalized(name), set: name, name: 'base', value: `${found.value}px`, source: { file, line: found.line } });
				break;
			}
		}
		return { source: themeFiles.name, tokens, problems };
	},
};
