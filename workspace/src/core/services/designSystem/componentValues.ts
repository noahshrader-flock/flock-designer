/**
 * A value is a token's when its tag shows through, its own when the tags leave it, derived when they change it into no tag.
 * A height is never a token: it sums what is inside it, so it moves with any token that does.
 */
import {
	COLOR_VALUES,
	type ComponentValues,
	type DesignToken,
	VALUE_PROPERTIES,
	type ValueCell,
	type ValueKind,
	type ValueProperty,
	type ValueRow,
} from '../../../shared/contract';
import type { Theme } from '../../../shared/prototypeTheme';
import { NO_COLOR, shortValue } from '../../../shared/valueParts';
import type { Drawn, Instance } from './componentTokens';
import { type Tags, asTag, inMode, isNothing, sizeToken } from './tokenTags';

const UNTAGGED: ReadonlySet<ValueProperty> = new Set(['fontSize']);

type Read = { shown: string; kind: ValueKind; tokens: string[] };

export const shown = (property: ValueProperty, value: string): string =>
	COLOR_VALUES.has(property) ? (isNothing(value) ? NO_COLOR : value) : shortValue(property, value);

type Reading = { tags: Tags; tokens: DesignToken[]; mode: Theme };

const colorRead = (plain: string, tagged: string, { tags, tokens, mode }: Reading): Pick<Read, 'kind' | 'tokens'> => {
	const tag = asTag(tagged);
	const path = tag ? tags.colors.get(tag) : undefined;
	if (path) return { kind: 'token', tokens: [inMode(tokens, path, mode)] };
	return { kind: tagged === plain ? 'own' : 'derived', tokens: [] };
};

/** A zero part says nothing, so it does not count as the component's own. */
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
	// A part that is a token exactly is named even when another part is worked out from one (MUI's skeleton: a radius and that over 0.6).
	if (derived > 0) return tokens.size === 0 ? { kind: 'derived', tokens: [] } : { kind: 'mixed', tokens: [...tokens] };
	return { kind: tokens.size === 0 ? 'own' : own > 0 ? 'mixed' : 'token', tokens: [...tokens] };
};

const readOne = (property: ValueProperty, plain: string, tagged: string | null, reading: Reading, marked: boolean): Read => {
	const said = shown(property, plain);
	const as = (r: Pick<Read, 'kind' | 'tokens'>): Read => ({ shown: said, ...r });
	if (COLOR_VALUES.has(property) && said === NO_COLOR) return as({ kind: 'own', tokens: [] });
	if (UNTAGGED.has(property)) return as({ kind: 'unchecked', tokens: [] });
	if (!marked) return as({ kind: 'own', tokens: [] });
	if (tagged === null) return as({ kind: 'unchecked', tokens: [] });
	if (COLOR_VALUES.has(property)) return as(colorRead(plain, tagged, reading));
	if (property === 'height') return as({ kind: tagged === plain ? 'own' : 'derived', tokens: [] });
	return as(lengthRead(plain, tagged, reading));
};

const keyOf = (r: Read): string => `${r.shown}|${r.kind}|${r.tokens.join(',')}`;

/** Controls first; else any prop but an id (one with a different value on every instance names the instance, not a variant). */
const candidatesOf = (instances: Instance[], controls: string[]): string[] => {
	const keys = [...new Set(instances.flatMap((i) => Object.keys(i.props)))];
	const named = keys.filter((k) => controls.includes(k));
	if (named.length > 0) return named;
	return keys.filter((k) => new Set(instances.map((i) => i.props[k])).size < instances.length);
};

type Entry = { instance: Instance; read: Read };
type Found = { parts: (string | null)[]; read: Read; targets: string[] };

/** Null unless every instance with one set of `keys`' values draws the same, and there are two cells or more. */
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

const cellOf = (variant: string | null, read: Read, targets: string[], of?: Record<string, string | null>[]): ValueCell => ({
	variant,
	value: read.shown,
	kind: read.kind,
	tokens: read.tokens,
	instances: targets.length,
	targets,
	...(of ? { of } : {}),
});

const caseOf = (f: Found, keys: string[]): Record<string, string | null> => Object.fromEntries(keys.map((k, i) => [k, f.parts[i] ?? null]));

/**
 * Each cell's variant as a person reads it: true by its name, false as "not" it, unset as "not set"; of two props, a
 * false or unset part is left out ("primary · disabled", "default" when both). Cells that then read and draw the same are
 * one; when two would read the same and draw differently, each is said in full.
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
	const merged = new Map<string, { read: Read; targets: string[]; of: Record<string, string | null>[] }>();
	for (const f of found) {
		const variant = short(f);
		const same = merged.get(variant);
		if (same === undefined) merged.set(variant, { read: f.read, targets: [...f.targets], of: [caseOf(f, keys)] });
		else if (keyOf(same.read) !== keyOf(f.read)) return found.map((x) => cellOf(full(x), x.read, x.targets, [caseOf(x, keys)]));
		else {
			same.targets.push(...f.targets);
			same.of.push(caseOf(f, keys));
		}
	}
	return [...merged].map(([variant, { read, targets, of }]) => cellOf(variant, read, targets, of));
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

/** Only drawings of the same instances, story by story and prop by prop, can be compared value by value. */
const pairs = (plain: Instance[], tagged: Instance[] | undefined): tagged is Instance[] =>
	tagged !== undefined &&
	tagged.length === plain.length &&
	tagged.every((t, i) => t.story === plain[i]?.story && JSON.stringify(t.props) === JSON.stringify(plain[i]?.props));

/** `tagged` is null when the tagged drawing did not draw, or there were no tags. */
interface ModeDrawings {
	plain: Drawn;
	tagged: Drawn | null;
}

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
		if (entries.every((e) => isNothing(e.read.shown) || e.read.shown === NO_COLOR)) continue;
		rows.push(rowOf(property, entries, candidates));
	}
	return rows;
};

/**
 * What is said of the file (no component, none drawn, threw) is from its light drawing, since dark is the same stories.
 * When two drawings do not pair up, no value is said to be a token or not.
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
		...(plain.rootPx === undefined ? {} : { rootPx: plain.rootPx }),
		rows: { light: rowsIn(light, { tags, tokens, mode: 'light' }), dark: rowsIn(dark, { tags, tokens, mode: 'dark' }) },
		unmarked: tags.unmarked,
	};
};
