/**
 * Found by shape (a tone family is an object of numbered hex steps, a palette an object with a `mode`), and only in files
 * whose path says colors, tokens, themes, palettes or tones.
 */
import type { DesignToken, TokenProblem } from '../../../../shared/contract';
import { type Entry, arrayItems, entryAt, exportedObjects, lineAt, literal, parseObject, replaced } from './objectLiteral';
import { MOTION_PARTS, SHADOWS, TYPE_KEYS, TYPE_PARTS, primitiveOf } from '../../../../shared/primitives';
import { capitalize } from '../../../../shared/titleCase';
import { PALETTE_GROUP, wholeHex } from '../../../../shared/tokens';
import { isScript } from '../componentCatalog';
import { type TokenSource, notWhereRead, semanticFirst } from './source';

const THEME_PATH = /(^|\/)(colou?rs?|tokens?|themes?|palettes?|tones?)(\/|\.|$)/i;

/** A string is the reason it is not read. */
const colorOf = (text: string, tones: Map<string, Map<string, string>>): { value: string; ref?: DesignToken['ref'] } | string => {
	const hex = literal(text);
	const whole = hex === null ? null : wholeHex(hex);
	if (whole !== null) return { value: whole };
	const m = /^(?:(\w+)\[(\d+)\]|`\$\{(\w+)\[(\d+)\]\}([0-9a-fA-F]{2})`)$/.exec(text);
	if (!m) return `${text} is not a tone step, a tone step with an opacity, or a hex, so it is not read`;
	const [tone, step, alpha] = m[1] ? [m[1], m[2] as string, undefined] : [m[3] as string, m[4] as string, m[5]];
	const value = tones.get(tone)?.get(step);
	if (value === undefined) return `${text} points at a tone step the library does not have`;
	const path = `tone.${tone}.${step}`;
	return { value: alpha ? `${value}${alpha.toUpperCase()}` : value, ref: alpha ? { path, alpha } : { path } };
};

const isTones = (entries: Entry[]): boolean =>
	entries.length > 0 &&
	entries.every((e) => e.key !== null && /^\d+$/.test(e.key)) &&
	entries.some((e) => e.value.kind === 'value' && wholeHex(literal(e.value.text) ?? '') !== null);

const modeOf = (entries: Entry[]): string | null => {
	const mode = entries.find((e) => e.key === 'mode')?.value;
	return mode?.kind === 'value' ? (/^(['"])(\w+)\1/.exec(mode.text)?.[2] ?? null) : null;
};

/**
 * Where a theme sets one of its parts: `name: {` (or `[`) in `createTheme`, or a `const name = {` of its own, either also
 * as a function that gives it (`typography: (palette) => ({`). Only those: `[theme.breakpoints.up('md')]: {` in a style is
 * not where the breakpoints are set.
 */
const themePart = (name: string, open: '{' | '['): RegExp =>
	new RegExp(`(?:\\b(?:const|let|var)\\s+${name}\\b[^=;\\n]*=|(?<![.\\w])${name}\\s*:)\\s*(?:\\([^()]*\\)\\s*=>\\s*\\(?\\s*)?\\${open}`);
const PALETTE = themePart('palette', '{');

/** `shape` is matched where the theme sets it (`themePart`), never a style that reads it (`theme.shape.borderRadius`). */
const THEME_NUMBERS: { path: string; key: string; inside: RegExp }[] = [
	{ path: 'spacing', key: 'spacing', inside: /createTheme\(\s*\{/ },
	{ path: 'radius', key: 'borderRadius', inside: themePart('shape', '{') },
];

const paletteIn = (text: string): Entry[] | null => {
	const open = PALETTE.exec(text);
	const node = open ? parseObject(text, open.index + open[0].length - 1).node : null;
	return node?.kind === 'object' ? node.entries : null;
};
const TYPOGRAPHY = themePart('typography', '{');

const themeValue = (written: string, unit = ''): string | null => {
	const number = /^-?\d+(\.\d+)?$/.exec(written)?.[0];
	return literal(written) ?? (number === undefined ? null : `${number}${unit}`);
};

/** A size written as a number is in pixels, as MUI reads it. A value that is not a literal (`pxToRem(60)`) is named, never guessed. */
const typographyOf = (file: string, text: string): { tokens: DesignToken[]; problems: TokenProblem[] } => {
	const tokens: DesignToken[] = [];
	const problems: TokenProblem[] = [];
	const open = TYPOGRAPHY.exec(text);
	if (!open) return { tokens, problems };
	const { node } = parseObject(text, open.index + open[0].length - 1);
	if (node.kind !== 'object') return { tokens, problems };
	const add = (e: Entry, path: string, group: string, set: string, name: string) => {
		const written = e.value.kind === 'value' ? e.value.text : '';
		const value = themeValue(written, group === TYPE_PARTS.size ? 'px' : '');
		if (value === null) problems.push({ file, line: e.line, reason: `${path} is ${written}, not a value, so it is not read` });
		else tokens.push({ path, kind: 'font', category: primitiveOf('font', path) as string, group, set, name, value, source: { file, line: e.line } });
	};
	for (const e of node.entries) {
		if (e.key === null) continue;
		const weight = /^fontWeight(\w+)$/.exec(e.key);
		if (e.key === 'fontFamily' || e.key === 'fontSize') add(e, `typography.${e.key}`, TYPE_KEYS[e.key] as string, 'base', e.key);
		else if (weight) add(e, `typography.${e.key}`, TYPE_PARTS.weight, 'weight', (weight[1] as string).toLowerCase());
		else if (e.value.kind === 'object')
			for (const part of e.value.entries)
				if (part.key !== null && TYPE_KEYS[part.key]) add(part, `typography.${e.key}.${part.key}`, TYPE_KEYS[part.key] as string, e.key, part.key);
	}
	return { tokens, problems };
};

const SHADOWS_AT = themePart('shadows', '[');

/** MUI's first level (`'none'`) is left out. A level that is not a string (`createShadow(1, 2)`) is named, never guessed. */
const shadowsOf = (file: string, text: string): { tokens: DesignToken[]; problems: TokenProblem[] } => {
	const tokens: DesignToken[] = [];
	const problems: TokenProblem[] = [];
	const open = SHADOWS_AT.exec(text);
	if (!open) return { tokens, problems };
	arrayItems(text, open.index + open[0].length - 1).forEach((item, level) => {
		const value = literal(item.text);
		if (value === null) problems.push({ file, line: item.line, reason: `shadows[${level}] is ${item.text}, not a value, so it is not read` });
		else if (value !== 'none')
			tokens.push({
				path: `shadows.${level}`,
				kind: 'shadow',
				category: primitiveOf('shadow', 'shadows') as string,
				group: SHADOWS,
				set: 'shadows',
				name: String(level),
				value,
				source: { file, line: item.line },
			});
	});
	return { tokens, problems };
};

const BREAKPOINTS = themePart('breakpoints', '{');
const TRANSITIONS = themePart('transitions', '{');

/** Breakpoints are in pixels and durations in milliseconds, as MUI reads them. A value that is not a literal is named, never guessed. */
const layoutAndMotionOf = (file: string, text: string): { tokens: DesignToken[]; problems: TokenProblem[] } => {
	const tokens: DesignToken[] = [];
	const problems: TokenProblem[] = [];
	const entriesIn = (at: RegExp, key: string) => {
		const open = at.exec(text);
		const node = open ? parseObject(text, open.index + open[0].length - 1).node : null;
		const inner = node?.kind === 'object' ? node.entries.find((e) => e.key === key)?.value : undefined;
		return inner?.kind === 'object' ? inner.entries : [];
	};
	const add = (entries: Entry[], path: string, unit: string, kind: DesignToken['kind'], group: string, set: string) => {
		for (const e of entries) {
			if (e.key === null) continue;
			const written = e.value.kind === 'value' ? e.value.text : 'an object';
			const value = themeValue(written, unit);
			if (value === null) problems.push({ file, line: e.line, reason: `${path}.${e.key} is ${written}, not a value, so it is not read` });
			else
				tokens.push({
					path: `${path}.${e.key}`,
					kind,
					category: primitiveOf(kind, path) as string,
					group,
					set,
					name: e.key,
					value,
					source: { file, line: e.line },
				});
		}
	};
	const breakpoints = primitiveOf('dimension', 'breakpoints') as string;
	add(entriesIn(BREAKPOINTS, 'values'), 'breakpoints', 'px', 'dimension', breakpoints, 'breakpoints');
	add(entriesIn(TRANSITIONS, 'duration'), 'transitions.duration', 'ms', 'duration', MOTION_PARTS.duration, 'duration');
	add(entriesIn(TRANSITIONS, 'easing'), 'transitions.easing', '', 'easing', MOTION_PARTS.easing, 'easing');
	return { tokens, problems };
};

const themeNumber = (
	text: string,
	{ key, inside }: (typeof THEME_NUMBERS)[number],
): { value: string; line: number; span: [number, number] } | null => {
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
		for (const file of files.filter((f) => isScript(f) && THEME_PATH.test(f)).sort()) {
			const text = await reads.readFile(file).catch(() => null);
			if (text === null) problems.push({ file, reason: `${file} could not be read` });
			else texts.set(file, text);
		}
		const objects = new Map<string, { file: string; entries: Entry[] }>();
		for (const [file, text] of texts) for (const [name, entries] of exportedObjects(text)) objects.set(name, { file, entries });

		const tones = new Map<string, Map<string, string>>();
		for (const [name, { file, entries }] of objects) {
			if (!isTones(entries)) continue;
			const steps = new Map<string, string>();
			for (const e of entries) {
				const hex = e.value.kind === 'value' ? wholeHex(literal(e.value.text) ?? '') : null;
				if (hex === null) {
					const written = e.value.kind === 'value' ? e.value.text : 'an object';
					problems.push({ file, line: e.line, reason: `${name} ${e.key} is ${written}, not a hex color, so this step is not read` });
					continue;
				}
				steps.set(e.key as string, hex);
				tokens.push({
					path: `tone.${name}.${e.key}`,
					kind: 'color',
					category: primitiveOf('color', name) as string,
					group: PALETTE_GROUP,
					set: name,
					name: e.key as string,
					value: hex,
					source: { file, line: e.line },
				});
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
		const palettes = [...objects]
			.map(([name, { entries }]) => ({ name, mode: modeOf(entries) }))
			.filter((p): p is { name: string; mode: string } => p.mode !== null)
			.sort((a, b) => (a.mode === 'light' ? -1 : b.mode === 'light' ? 1 : a.mode.localeCompare(b.mode)));
		// With none, the palette `createTheme` is given in place, light unless it says.
		if (palettes.length === 0) {
			for (const [file, text] of texts) {
				const entries = paletteIn(text);
				if (entries === null) continue;
				objects.set('palette', { file, entries });
				palettes.push({ name: 'palette', mode: modeOf(entries) ?? 'light' });
				break;
			}
		}
		for (const { name, mode } of palettes) {
			for (const r of rolesOf(name))
				tokens.push({ path: `palette.${mode}.${r.set}.${r.name}`, category: primitiveOf('color', r.name) as string, group: capitalize(mode), ...r });
		}
		// A theme is tones, a palette, or a call to MUI's `createTheme`; a file with none of them is not one.
		if (tones.size === 0 && palettes.length === 0 && ![...texts.values()].some((t) => /\bcreateTheme\s*\(/.test(t))) return null;

		for (const number of THEME_NUMBERS) {
			const name = number.path;
			for (const [file, text] of texts) {
				const found = themeNumber(text, number);
				if (!found) continue;
				tokens.push({
					path: name,
					kind: 'dimension',
					category: primitiveOf('dimension', name) as string,
					group: capitalize(name),
					set: name,
					name: 'base',
					value: `${found.value}px`,
					source: { file, line: found.line },
				});
				break;
			}
		}
		for (const read of [typographyOf, shadowsOf, layoutAndMotionOf]) {
			for (const [file, text] of texts) {
				const found = read(file, text);
				if (found.tokens.length === 0 && found.problems.length === 0) continue;
				tokens.push(...found.tokens);
				problems.push(...found.problems);
				break;
			}
		}
		// The tones are the primitives the palettes are made from: after them.
		return { source: themeFiles.name, tokens: semanticFirst(tokens, (t) => t.group === PALETTE_GROUP), problems };
	},

	edit: (text, token, to) => {
		if (token.kind === 'dimension') {
			const number = THEME_NUMBERS.find((n) => n.path === token.path);
			const found = number && themeNumber(text, number);
			if (!found || found.line !== token.source.line) throw notWhereRead(token);
			const px = 'value' in to ? /^(\d+)px$/.exec(to.value)?.[1] : undefined;
			if (px === undefined)
				throw new Error(`The theme sets ${token.path} as a whole number of pixels, so it cannot be ${'value' in to ? to.value : 'a pointer'}.`);
			return replaced(text, found.span, px);
		}
		const entry = entryAt(text, token.name, token.source.line, paletteIn(text) ?? []);
		if (!entry || entry.value.kind !== 'value') throw notWhereRead(token);
		if ('value' in to) return replaced(text, entry.span, `'${to.value.toUpperCase()}'`);
		// A role points at a tone step; the tone must already be in the file, which is what makes it reachable there.
		const step = /^tone\.(\w+)\.(\d+)$/.exec(to.ref);
		if (!step) throw new Error(`${token.path} can point only at a tone step, not at ${to.ref}.`);
		const [tone, at] = [step[1] as string, step[2] as string];
		if (!new RegExp(`\\b${tone}\\b`).test(text))
			throw new Error(`${token.source.file} does not use ${tone}, so ${token.path} cannot point at it there.`);
		const alpha = token.ref?.alpha;
		return replaced(text, entry.span, alpha ? `\`\${${tone}[${at}]}${alpha}\`` : `${tone}[${at}]`);
	},
};
