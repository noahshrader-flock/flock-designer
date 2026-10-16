/**
 * A component's drawn values (Phase 1 of adjusting a component, DESIGN_SYSTEM_PLAN.md): each instance its stories draw,
 * read in the page (`storyDrawing.ts`) as the library has it and with every token tagged (T6's two light drawings), put
 * together into one row for each property. **Nothing is read from the component's source:** a value is a token's when the
 * token's tag shows through in the tagged drawing, the component's own when the tags leave it as it is, and worked out from
 * a token when the tags change it into no tag. A height is never said to be a token: it is a sum of what is inside it, so it
 * moves with any token that is. A font size is never said to be either, since no type token is tagged.
 *
 * A row's values are told apart by the prop that explains them ("by size": sm 28px, md 36px), or two props together, of
 * those the stories name as controls; else by distinct value, most drawn first.
 */
import {
	COLOR_VALUES,
	type ComponentValues,
	VALUE_PROPERTIES,
	type ValueCell,
	type ValueKind,
	type ValueProperty,
	type ValueRow,
} from '../../shared/contract';
import type { DesignToken } from '../../shared/contract';
import type { Theme } from '../../shared/prototypeTheme';
import type { Drawn, Instance } from './componentTokens';
import { type Tags, asTag, inMode, isNothing, sizeToken } from './tokenTags';

/** What no token is tagged for, so is never said to be a token or not. */
const UNTAGGED: ReadonlySet<ValueProperty> = new Set(['fontSize']);

/** One instance's value of one property, read: the value as it is said (`shown`), and what it is. */
type Read = { shown: string; kind: ValueKind; tokens: string[] };

/**
 * A value as it is said: padding's four sides and a radius's four corners as CSS writes them short (`0px 10px`), a gap's
 * row and column as one when they are the same, and a colour that draws nothing (clear, or no border) as none.
 */
const shown = (property: ValueProperty, value: string): string => {
	if (COLOR_VALUES.has(property)) return isNothing(value) ? 'none' : value;
	const [a, b = a, c = a, d = b] = value.split(' ') as [string, string?, string?, string?];
	if (property === 'gap') return a === b ? a : `${a} ${b}`;
	if (property !== 'padding' && property !== 'radius') return value;
	return a === b && b === c && c === d ? a : a === c && b === d ? `${a} ${b}` : b === d ? `${a} ${b} ${c}` : `${a} ${b} ${c} ${d}`;
};

/** What reads values in one mode: the tags, and the tokens, whose twins in dark a tag given to a shared role names. */
type Reading = { tags: Tags; tokens: DesignToken[]; mode: Theme };

const colorRead = (plain: string, tagged: string, { tags, tokens, mode }: Reading): Pick<Read, 'kind' | 'tokens'> => {
	const tag = asTag(tagged);
	const path = tag ? tags.colors.get(tag) : undefined;
	if (path) return { kind: 'token', tokens: [inMode(tokens, path, mode)] };
	return { kind: tagged === plain ? 'own' : 'derived', tokens: [] };
};

/** A length, part by part: a part the tags left alone is the component's own (a zero says nothing), one that became a tag's multiple is that token. */
const lengthRead = (plain: string, tagged: string, { tags, tokens: all, mode }: Reading): Pick<Read, 'kind' | 'tokens'> => {
	const was = plain.split(' ');
	const now = tagged.split(' ');
	if (was.length !== now.length) return { kind: 'unchecked', tokens: [] };
	const tokens = new Set<string>();
	let own = 0;
	let derived = 0;
	was.forEach((part, i) => {
		if (part === now[i]) {
			if (!isNothing(part)) own++;
			return;
		}
		const path = sizeToken(now[i] as string, tags.sizes);
		if (path) tokens.add(inMode(all, path, mode));
		else derived++;
	});
	if (derived > 0) return { kind: 'derived', tokens: [] };
	return { kind: tokens.size === 0 ? 'own' : own > 0 ? 'mixed' : 'token', tokens: [...tokens] };
};

/**
 * What one value is, given its tagged twin: null when the two drawings do not pair up; and whether there were any tags to
 * draw with (`marked`), without which every value the component draws is its own.
 */
const readOne = (property: ValueProperty, plain: string, tagged: string | null, reading: Reading, marked: boolean): Read => {
	const said = shown(property, plain);
	const as = (r: Pick<Read, 'kind' | 'tokens'>): Read => ({ shown: said, ...r });
	if (COLOR_VALUES.has(property) && said === 'none') return as({ kind: 'own', tokens: [] });
	if (UNTAGGED.has(property)) return as({ kind: 'unchecked', tokens: [] });
	if (!marked) return as({ kind: 'own', tokens: [] });
	if (tagged === null) return as({ kind: 'unchecked', tokens: [] });
	if (COLOR_VALUES.has(property)) return as(colorRead(plain, tagged, reading));
	if (property === 'height') return as({ kind: tagged === plain ? 'own' : 'derived', tokens: [] });
	return as(lengthRead(plain, tagged, reading));
};

const keyOf = (r: Read): string => `${r.shown}|${r.kind}|${r.tokens.join(',')}`;

/**
 * The props a row may be told apart by: those the stories name as controls that the instances were drawn with; when there
 * are none, any that is not an id (a prop with a different value on every instance in the file names the instance).
 */
const candidatesOf = (instances: Instance[], controls: string[]): string[] => {
	const keys = [...new Set(instances.flatMap((i) => Object.keys(i.props)))];
	const named = keys.filter((k) => controls.includes(k));
	if (named.length > 0) return named;
	return keys.filter((k) => new Set(instances.map((i) => i.props[k])).size < instances.length);
};

type Entry = { instance: Instance; read: Read };
/** A cell before its variant is said: the value of each prop it is told apart by, a prop it was drawn without as null, and the instances that draw it. */
type Found = { parts: (string | null)[]; read: Read; targets: string[] };

/** The cells for `keys`, when every instance with one set of their values draws the same; null when they do not. In the order first drawn. */
const explainedBy = (entries: Entry[], keys: string[]): Found[] | null => {
	const cells = new Map<string, Found>();
	for (const { instance, read } of entries) {
		const parts = keys.map((k) => instance.props[k] ?? null);
		const label = JSON.stringify(parts);
		const cell = cells.get(label);
		if (cell === undefined) cells.set(label, { parts, read, targets: [instance.key] });
		else if (keyOf(cell.read) !== keyOf(read)) return null;
		else cell.targets.push(instance.key);
	}
	return cells.size < 2 ? null : [...cells.values()];
};

const cellOf = (variant: string | null, read: Read, targets: string[]): ValueCell => ({
	variant,
	value: read.shown,
	kind: read.kind,
	tokens: read.tokens,
	instances: targets.length,
	targets,
});

/**
 * Each cell's variant as a person reads it: a prop that is true by its name, false as "not" it, one drawn without it as
 * not set (it draws its default); of two props, a part that is false or not set is left out ("primary", "primary ·
 * disabled"), "default" when both are. Cells that then read the same and draw the same are one (not set and false draw the
 * default alike); when two would read the same and draw differently, each is said in full.
 */
const said = (found: Found[], keys: string[]): ValueCell[] => {
	const alone = keys.length === 1;
	const full = (f: Found) => f.parts.map((v) => v ?? 'not set').join(' · ');
	const short = (f: Found) => {
		const kept = f.parts.flatMap((v, i) => {
			if (v === 'true') return [keys[i] as string];
			if (v === 'false') return alone ? [`not ${keys[i]}`] : [];
			if (v === null) return alone ? ['not set'] : [];
			return [v];
		});
		return kept.length === 0 ? 'default' : kept.join(' · ');
	};
	const merged = new Map<string, { read: Read; targets: string[] }>();
	for (const f of found) {
		const variant = short(f);
		const same = merged.get(variant);
		if (same === undefined) merged.set(variant, { read: f.read, targets: [...f.targets] });
		else if (keyOf(same.read) !== keyOf(f.read)) return found.map((x) => cellOf(full(x), x.read, x.targets));
		else same.targets.push(...f.targets);
	}
	return [...merged].map(([variant, { read, targets }]) => cellOf(variant, read, targets));
};

const rowOf = (property: ValueProperty, entries: Entry[], candidates: string[]): ValueRow => {
	const distinct = new Map<string, { read: Read; targets: string[] }>();
	for (const { instance, read } of entries) {
		const kept = distinct.get(keyOf(read));
		if (kept) kept.targets.push(instance.key);
		else distinct.set(keyOf(read), { read, targets: [instance.key] });
	}
	const values = [...distinct.values()];
	if (values.length === 1) return { property, by: null, cells: values.map((v) => cellOf(null, v.read, v.targets)) };
	// One prop that explains it, with the fewest values; then two together, with the fewest combinations, and only where at
	// least one combination is drawn more than once: two props with each combination drawn once explain anything.
	let best: { keys: string[]; found: Found[] } | null = null;
	for (const key of candidates) {
		const found = explainedBy(entries, [key]);
		if (found !== null && (best === null || found.length < best.found.length)) best = { keys: [key], found };
	}
	if (best === null) {
		for (const keys of candidates.flatMap((a, i) => candidates.slice(i + 1).map((b) => [a, b]))) {
			const found = explainedBy(entries, keys);
			if (found === null || !found.some((f) => f.targets.length > 1)) continue;
			if (best === null || found.length < best.found.length) best = { keys, found };
		}
	}
	if (best !== null) return { property, by: best.keys.join(', '), cells: said(best.found, best.keys) };
	return { property, by: null, cells: values.sort((a, b) => b.targets.length - a.targets.length).map((v) => cellOf(null, v.read, v.targets)) };
};

/** Whether two drawings of a file drew the same instances, story by story and prop by prop: only then is one the other's twin. */
const pairs = (plain: Instance[], tagged: Instance[] | undefined): tagged is Instance[] =>
	tagged !== undefined &&
	tagged.length === plain.length &&
	tagged.every((t, i) => t.story === plain[i]?.story && JSON.stringify(t.props) === JSON.stringify(plain[i]?.props));

/** One mode's drawings of a story file: as the library has it, and with the tags (null when that did not draw, or there were none). */
export interface ModeDrawings {
	plain: Drawn;
	tagged: Drawn | null;
}

/** One mode's rows, from its drawings; null when its stories drew no instance of the component. */
const rowsIn = (drawings: ModeDrawings | undefined, reading: Reading): ValueRow[] | null => {
	const instances = drawings?.plain.instances ?? [];
	if (drawings === undefined || instances.length === 0) return null;
	const marked = reading.tags.edits.length > 0;
	const twins = drawings.tagged?.instances;
	const paired = marked && pairs(instances, twins);
	const candidates = candidatesOf(instances, drawings.plain.controls ?? []);
	const rows: ValueRow[] = [];
	for (const property of VALUE_PROPERTIES) {
		const entries = instances.map((instance, i) => ({
			instance,
			read: readOne(property, instance.values[property] ?? '', paired ? (twins?.[i]?.values[property] ?? '') : null, reading, marked),
		}));
		// A property no instance draws anything of (no gap, no border, no background) is no row.
		if (entries.every((e) => isNothing(e.read.shown) || e.read.shown === 'none')) continue;
		rows.push(rowOf(property, entries, candidates));
	}
	return rows;
};

/**
 * The values a story file's instances draw, in light and in dark, each from its drawing as the library has it and with the
 * tags. What is said of the file (it names no component, its stories draw none, they only wrap, they threw) is said from
 * its light drawing: dark is the same stories. With no tag to draw with, every value is the component's own; when two
 * drawings do not pair up, no value is said to be a token or not.
 */
export const readValues = (light: ModeDrawings, dark: ModeDrawings | undefined, tags: Tags, tokens: DesignToken[]): ComponentValues => {
	const plain = light.plain;
	if (plain.instancesFailed !== undefined) return { state: 'failed', error: plain.instancesFailed };
	if (!plain.component) return { state: 'no-component' };
	const instances = plain.instances ?? [];
	if (instances.length === 0) {
		if ((plain.wrapping ?? 0) > 0) return { state: 'wraps' };
		return { state: (plain.storiesFailed ?? 0) > 0 ? 'not-drawn' : 'none-drawn' };
	}
	return {
		state: 'read',
		instances: instances.length,
		rows: { light: rowsIn(light, { tags, tokens, mode: 'light' }), dark: rowsIn(dark, { tags, tokens, mode: 'dark' }) },
		unmarked: tags.unmarked,
	};
};
