/**
 * Each file is read again with the theme files' reader (JSON is an object literal too), so lines are exact and a change is
 * written in the shape it had.
 */
import type { DesignToken, TokenProblem } from '../../../../shared/contract';
import { DIMENSION, DURATION, lengthParts } from '../../../../shared/tokens';
import { type Entry, parseObject, replaced } from './objectLiteral';
import { MOTION_PARTS, SHADOWS, TYPE_KEYS, TYPE_PARTS, primitiveOf } from '../../../../shared/primitives';
import { capitalize } from '../../../../shared/titleCase';
import { type TokenSource, notWhereRead, semanticFirst } from './source';

const TOKEN_FILE = /(\.tokens\.json|(^|\/)(design-)?tokens?\.json|(^|\/)(design-)?tokens\/.+\.json)$/i;

interface Raw {
	path: string[];
	type: string | undefined;
	/** For a type that says which primitive it is (Tokens Studio's `borderRadius`), the word that says so; else its path. */
	named?: string;
	value: unknown;
	file: string;
	line: number;
}

/**
 * Tokens Studio's names for the standard's types (and a border's, which is a width), each with the word that says which
 * primitive it is when its type says that and its name may not (`rounding.md` of type `borderRadius` is a radius).
 */
const TYPE_NAMES: Record<string, { type: string; named?: string }> = {
	spacing: { type: 'dimension', named: 'spacing' },
	borderRadius: { type: 'dimension', named: 'radius' },
	borderWidth: { type: 'dimension', named: 'border' },
	border: { type: 'border', named: 'border' },
	fontSizes: { type: 'dimension', named: 'fontSize' },
	fontFamilies: { type: 'fontFamily' },
	fontWeights: { type: 'fontWeight' },
	lineHeights: { type: 'lineHeight' },
	boxShadow: { type: 'shadow' },
};

const entriesOf = (text: string): Map<string, Entry> => {
	const at = new Map<string, Entry>();
	const open = text.indexOf('{');
	const walk = (entries: Entry[], path: string[]) => {
		for (const e of entries) {
			if (e.key === null) continue;
			at.set([...path, e.key].join('.'), e);
			if (e.value.kind === 'object') walk(e.value.entries, [...path, e.key]);
		}
	};
	const { node } = parseObject(text, open);
	if (open >= 0 && node.kind === 'object') walk(node.entries, []);
	return at;
};

const POINTER = /^\{([^{}]+)\}$/;

/** A number with no unit, as Tokens Studio writes a length in pixels: `"8"`, or `8`. */
const BARE = /^-?\d*\.?\d+$/;

const lengthOf = (value: unknown): string | null => {
	if (typeof value === 'number' || (typeof value === 'string' && BARE.test(value))) return `${value}px`;
	if (typeof value === 'string') return DIMENSION.test(value) ? value : null;
	const v = value as { value?: unknown; unit?: unknown } | null;
	return typeof v?.value === 'number' && typeof v.unit === 'string' && DIMENSION.test(`${v.value}${v.unit}`) ? `${v.value}${v.unit}` : null;
};

const familyOf = (value: unknown): string | null =>
	typeof value === 'string' ? value : Array.isArray(value) && value.every((v) => typeof v === 'string') ? value.join(', ') : null;
const plainOf = (value: unknown): string | null => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value : null);

const READ_PART: Record<string, (v: unknown) => string | null> = {
	[TYPE_PARTS.family]: familyOf,
	[TYPE_PARTS.size]: (v) => lengthOf(v),
	[TYPE_PARTS.weight]: plainOf,
	[TYPE_PARTS.lineHeight]: plainOf,
};

const TYPE_PART_OF: Record<string, string> = { fontFamily: TYPE_PARTS.family, fontWeight: TYPE_PARTS.weight, lineHeight: TYPE_PARTS.lineHeight };

/** Takes the standard's parts or Tokens Studio's (`x`, `y`, `innerShadow`); null when a part it needs is missing. */
const boxShadowOf = (value: unknown, resolve: (v: unknown) => unknown): string | null => {
	const one = (s: unknown): string | null => {
		const o = s !== null && typeof s === 'object' ? (s as Record<string, unknown>) : {};
		const color = resolve(o.color);
		const lengths = [o.offsetX ?? o.x, o.offsetY ?? o.y, o.blur, o.spread].map((l) => lengthOf(resolve(l)));
		if (typeof color !== 'string' || lengths.some((l) => l === null)) return null;
		return `${o.inset === true || o.type === 'innerShadow' ? 'inset ' : ''}${lengths.join(' ')} ${color}`;
	};
	const all = (Array.isArray(value) ? value : [value]).map(one);
	return all.length > 0 && all.every((s) => s !== null) ? all.join(', ') : null;
};

const durationOf = (value: unknown): string | null => {
	if (typeof value === 'string') return DURATION.test(value) ? value : null;
	const v = value as { value?: unknown; unit?: unknown } | null;
	return typeof v?.value === 'number' && (v.unit === 'ms' || v.unit === 's') ? `${v.value}${v.unit}` : null;
};
const easingOf = (value: unknown): string | null =>
	Array.isArray(value) && value.length === 4 && value.every((n) => typeof n === 'number') ? `cubic-bezier(${value.join(', ')})` : null;

export const tokenFiles: TokenSource = {
	name: 'token files',
	read: async (reads, files) => {
		const raws = new Map<string, Raw>();
		const problems: TokenProblem[] = [];
		for (const file of files.filter((f) => TOKEN_FILE.test(f)).sort()) {
			const text = await reads.readFile(file).catch(() => null);
			if (text === null) continue;
			let json: unknown;
			try {
				json = JSON.parse(text);
			} catch {
				problems.push({ file, reason: `${file} is not JSON, so it is not read` });
				continue;
			}
			const at = entriesOf(text);
			const lineOf = (path: string[]) => at.get(path.join('.'))?.line ?? 1;
			// The standard's `$value` and `$type`, or, in a file with none, the `value` and `type` Tokens Studio and Style
			// Dictionary's older format write.
			const [VALUE, TYPE] = /"\$value"\s*:/.test(text) ? ['$value', '$type'] : ['value', 'type'];
			const walk = (node: unknown, path: string[], type: string | undefined) => {
				if (node === null || typeof node !== 'object') return;
				const o = node as Record<string, unknown>;
				const own = typeof o[TYPE] === 'string' ? (o[TYPE] as string) : type;
				if (VALUE in o) {
					const named = own === undefined ? undefined : TYPE_NAMES[own];
					raws.set(path.join('.'), { path, type: named?.type ?? own, named: named?.named, value: o[VALUE], file, line: lineOf(path) });
					return;
				}
				for (const [key, child] of Object.entries(o)) if (!key.startsWith('$')) walk(child, [...path, key], own);
			};
			walk(json, [], undefined);
		}
		const resolve = (value: unknown, depth = 0): unknown => {
			const m = typeof value === 'string' ? POINTER.exec(value) : null;
			const next = m ? raws.get(m[1] as string) : undefined;
			return next && depth <= 5 ? resolve(next.value, depth + 1) : value;
		};

		const tokens: DesignToken[] = [];
		for (const [path, raw] of raws) {
			const value = resolve(raw.value);
			const typeToken = (at: string, group: string, set: string, name: string, written: string | null) => {
				if (written !== null)
					tokens.push({
						path: at,
						kind: 'font',
						category: primitiveOf('font', at) as string,
						group,
						set,
						name,
						value: written,
						source: { file: raw.file, line: raw.line },
					});
			};
			const set = raw.path.slice(0, -1).join('.') || path;
			const last = raw.path[raw.path.length - 1] as string;
			const naming = raw.named ?? path;
			const part = raw.type === undefined ? undefined : TYPE_PART_OF[raw.type];
			if (part !== undefined) {
				typeToken(path, part, set, last, (READ_PART[part] as (v: unknown) => string | null)(value));
				continue;
			}
			if (raw.type === 'dimension' && /font[._-]?size/i.test(naming)) {
				typeToken(path, TYPE_PARTS.size, set, last, lengthOf(value));
				continue;
			}
			const motion = (at: string, kind: 'duration' | 'easing', motionSet: string, name: string, written: string | null) => {
				if (written === null) problems.push({ file: raw.file, line: raw.line, reason: `${at} is not a duration or an easing that can be read` });
				else
					tokens.push({
						path: at,
						kind,
						category: primitiveOf(kind, at) as string,
						group: MOTION_PARTS[kind],
						set: motionSet,
						name,
						value: written,
						source: { file: raw.file, line: raw.line },
					});
			};
			if (raw.type === 'duration' || raw.type === 'cubicBezier') {
				motion(path, raw.type === 'duration' ? 'duration' : 'easing', set, last, raw.type === 'duration' ? durationOf(value) : easingOf(value));
				continue;
			}
			if (raw.type === 'transition') {
				const o = (value ?? {}) as Record<string, unknown>;
				motion(`${path}.duration`, 'duration', path, 'duration', durationOf(resolve(o.duration)));
				motion(`${path}.timingFunction`, 'easing', path, 'timingFunction', easingOf(resolve(o.timingFunction)));
				continue;
			}
			if (raw.type === 'shadow') {
				const shadow = boxShadowOf(value, resolve);
				if (shadow === null)
					problems.push({
						file: raw.file,
						line: raw.line,
						reason: `${path} is not a shadow that can be read: it needs a color, offsets, a blur and a spread`,
					});
				else
					tokens.push({
						path,
						kind: 'shadow',
						category: primitiveOf('shadow', path) as string,
						group: SHADOWS,
						set,
						name: last,
						value: shadow,
						source: { file: raw.file, line: raw.line },
					});
				continue;
			}
			if (raw.type === 'typography' && value !== null && typeof value === 'object') {
				for (const [key, group] of Object.entries(TYPE_KEYS)) {
					const piece = (value as Record<string, unknown>)[key];
					if (piece !== undefined) typeToken(`${path}.${key}`, group, path, key, (READ_PART[group] as (v: unknown) => string | null)(resolve(piece)));
				}
				continue;
			}
			const color = raw.type === 'color' && typeof value === 'string' ? value : null;
			// A border is shown as its width, which is what Borders holds.
			const length =
				raw.type === 'dimension' ? lengthOf(value) : raw.type === 'border' ? lengthOf(resolve((value as { width?: unknown } | null)?.width)) : null;
			const kind = color !== null ? 'color' : length !== null ? 'dimension' : null;
			const category = kind === null ? null : primitiveOf(kind, naming);
			if (kind === null || category === null) continue;
			tokens.push({
				path,
				kind,
				category,
				group: capitalize(raw.path[0] as string),
				set,
				name: last,
				value: (color ?? length) as string,
				source: { file: raw.file, line: raw.line },
			});
		}
		// A pointer is kept only to a token the list has.
		const paths = new Set(tokens.map((t) => t.path));
		for (const t of tokens) {
			const written = raws.get(t.path)?.value;
			const named = typeof written === 'string' ? POINTER.exec(written)?.[1] : undefined;
			if (named !== undefined && paths.has(named)) t.ref = { path: named };
		}
		// A token that names another is the semantic one; the ones with a value of their own are the primitives.
		const named = (t: DesignToken) => POINTER.test(String(raws.get(t.path)?.value));
		return tokens.length === 0 && problems.length === 0
			? null
			: { source: tokenFiles.name, tokens: semanticFirst(tokens, (t) => !named(t)), problems };
	},

	edit: (text, token, to) => {
		const at = entriesOf(text);
		const own = at.get(`${token.path}.$value`) ?? at.get(`${token.path}.value`);
		if (!own || at.get(token.path)?.line !== token.source.line) throw notWhereRead(token);
		if ('ref' in to) return replaced(text, own.span, JSON.stringify(`{${to.ref}}`));
		// A length keeps the shape it is written in: `{ "value": 4, "unit": "px" }`, or a number of pixels with no unit; anything
		// else is written as a string.
		const length = lengthParts(to.value);
		if (length && own.value.kind === 'object') return replaced(text, own.span, `{ "value": ${length.number}, "unit": "${length.unit}" }`);
		const bare = own.value.kind === 'value' && BARE.test(JSON.parse(own.value.text) as string);
		if (length && bare && length.unit === 'px') return replaced(text, own.span, JSON.stringify(String(length.number)));
		return replaced(text, own.span, JSON.stringify(to.value));
	},
};
