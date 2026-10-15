/**
 * A component's drawn values (Phase 1 of adjusting a component, DESIGN_SYSTEM_PLAN.md): each instance its stories draw,
 * read in the page (`storyDrawing.ts`) as the library has it and with every token tagged (T6's two drawings), put
 * together into one row for each property. **Nothing is read from the component's source:** a value is a token's when
 * the token's tag shows through in the tagged drawing, the component's own when the tags leave it as it is, and worked out
 * from a token when the tags change it into no tag. A font size is never said to be either, since no type token is tagged.
 *
 * A row's values are told apart by the prop that explains them ("by size": sm 28px, md 36px), or two props together, of
 * those the stories name as controls; else by distinct value, most drawn first.
 */
import { type ComponentValues, VALUE_PROPERTIES, type ValueCell, type ValueKind, type ValueProperty, type ValueRow } from '../../shared/contract';
import { type Drawn, type Instance, type Tags, asTag, isNothing, sizeToken } from './componentTokens';

const COLORS: ReadonlySet<ValueProperty> = new Set(['background', 'text', 'border']);
/** What no token is tagged for, so is never said to be a token or not. */
const UNTAGGED: ReadonlySet<ValueProperty> = new Set(['fontSize']);

/** One instance's value of one property, read. */
type Read = { value: string; kind: ValueKind; tokens: string[] };

/** A value of up to four parts (padding's sides, a radius's corners) or two (a gap's row and column), as all its parts. */
const partsOf = (property: ValueProperty, value: string): string[] => {
	const p = value.split(' ');
	if (property === 'gap') return p.length === 1 ? [p[0] as string, p[0] as string] : p;
	if (property !== 'padding' && property !== 'radius') return p;
	const [a, b = a, c = a, d = b] = p as [string, string?, string?, string?];
	return [a, b, c, d];
};

const colorRead = (plain: string, tagged: string, tags: Tags): Read => {
	const tag = asTag(tagged);
	const path = tag ? tags.colors.get(tag) : undefined;
	if (path) return { value: plain, kind: 'token', tokens: [path] };
	return { value: plain, kind: tagged === plain ? 'own' : 'derived', tokens: [] };
};

/** A length, part by part: a part the tags left alone is the component's own (a zero says nothing), one that became a tag's multiple is that token. */
const sizeRead = (property: ValueProperty, plain: string, tagged: string, tags: Tags): Read => {
	const was = partsOf(property, plain);
	const now = partsOf(property, tagged);
	if (was.length !== now.length) return { value: plain, kind: 'unchecked', tokens: [] };
	const tokens = new Set<string>();
	let own = 0;
	let derived = 0;
	was.forEach((part, i) => {
		if (part === now[i]) {
			if (!isNothing(part)) own++;
			return;
		}
		const path = sizeToken(now[i] as string, tags.sizes);
		if (path) tokens.add(path);
		else derived++;
	});
	const kind: ValueKind = derived > 0 ? 'derived' : tokens.size > 0 ? (own > 0 ? 'mixed' : 'token') : 'own';
	return { value: plain, kind, tokens: kind === 'derived' ? [] : [...tokens] };
};

/** What one value is, given its tagged twin (null when the two drawings do not pair up) and the tags (null when there are none). */
const readOne = (property: ValueProperty, plain: string, tagged: string | null | undefined, tags: Tags | null): Read => {
	// A colour that draws nothing (clear, or no border) is none, whatever the tags do with it.
	if (COLORS.has(property) && isNothing(plain)) return { value: 'none', kind: 'own', tokens: [] };
	if (UNTAGGED.has(property)) return { value: plain, kind: 'unchecked', tokens: [] };
	if (tags === null) return { value: plain, kind: 'own', tokens: [] };
	if (tagged === null || tagged === undefined) return { value: plain, kind: 'unchecked', tokens: [] };
	return COLORS.has(property) ? colorRead(plain, tagged, tags) : sizeRead(property, plain, tagged, tags);
};

const keyOf = (r: Read): string => `${r.value}|${r.kind}|${r.tokens.join(',')}`;

/** The props a row may be told apart by: those the stories name as controls, or, when they name none, any that is not an id. */
const candidatesOf = (instances: Instance[], controls: string[]): string[] => {
	const keys = [...new Set(instances.flatMap((i) => Object.keys(i.props)))];
	if (controls.length > 0) return keys.filter((k) => controls.includes(k));
	// A prop with a different value on every instance in the file names the instance, not a variant of it.
	return keys.filter((k) => new Set(instances.map((i) => i.props[k])).size < instances.length);
};

/** Each instance's label under `keys`, joined; a prop an instance was drawn without is said as not set (it draws its default). */
const labelOf = (instance: Instance, keys: string[]): string => keys.map((k) => instance.props[k] ?? 'not set').join(' · ');

/**
 * The cells for `keys`, when every instance with one label draws the same value; null when they do not. In the order the
 * labels are first drawn.
 */
const explainedBy = (entries: { instance: Instance; read: Read }[], keys: string[]): ValueCell[] | null => {
	const cells = new Map<string, { read: Read; instances: number }>();
	for (const { instance, read } of entries) {
		const label = labelOf(instance, keys);
		const cell = cells.get(label);
		if (cell === undefined) cells.set(label, { read, instances: 1 });
		else if (keyOf(cell.read) !== keyOf(read)) return null;
		else cell.instances++;
	}
	if (cells.size < 2) return null;
	return [...cells].map(([variant, { read, instances }]) => ({ variant, ...read, instances }));
};

/**
 * A cell's variant as a person reads it: a prop that is true by its name, false as "not" it; and of two props, a part that
 * is false or not set is left out ("primary", "primary · disabled"), "default" when both are. Cells that then read the same
 * and draw the same are one (not set and false draw the default alike); when two would read the same and draw differently,
 * every cell is left as it was.
 */
const said = (cells: ValueCell[], keys: string[]): ValueCell[] => {
	const part = (key: string, value: string, alone: boolean): string | null =>
		value === 'true' ? key : value === 'false' ? (alone ? `not ${key}` : null) : value === 'not set' && !alone ? null : value;
	const merged = new Map<string, ValueCell>();
	for (const c of cells) {
		const parts = (c.variant as string).split(' · ').map((v, i) => part(keys[i] as string, v, keys.length === 1));
		const kept = parts.filter((p): p is string => p !== null);
		const variant = kept.length === 0 ? 'default' : kept.join(' · ');
		const same = merged.get(variant);
		if (same === undefined) merged.set(variant, { ...c, variant });
		else if (keyOf(same) !== keyOf(c)) return cells;
		else same.instances += c.instances;
	}
	return [...merged.values()];
};

const rowOf = (property: ValueProperty, entries: { instance: Instance; read: Read }[], candidates: string[]): ValueRow => {
	const distinct = new Map<string, { read: Read; instances: number }>();
	for (const { read } of entries) {
		const kept = distinct.get(keyOf(read));
		if (kept) kept.instances++;
		else distinct.set(keyOf(read), { read, instances: 1 });
	}
	if (distinct.size === 1) {
		const [{ read, instances }] = [...distinct.values()] as [{ read: Read; instances: number }];
		return { property, by: null, cells: [{ variant: null, ...read, instances }] };
	}
	// One prop that explains it, with the fewest values; then two together, with the fewest combinations.
	const tries = [...candidates.map((k) => [k]), ...candidates.flatMap((a, i) => candidates.slice(i + 1).map((b) => [a, b]))];
	let best: { keys: string[]; cells: ValueCell[] } | null = null;
	for (const keys of tries) {
		if (best !== null && keys.length > best.keys.length) break;
		const cells = explainedBy(entries, keys);
		if (cells !== null && (best === null || cells.length < best.cells.length)) best = { keys, cells };
	}
	if (best !== null) return { property, by: best.keys.join(', '), cells: said(best.cells, best.keys) };
	return {
		property,
		by: null,
		cells: [...distinct.values()].sort((a, b) => b.instances - a.instances).map(({ read, instances }) => ({ variant: null, ...read, instances })),
	};
};

/**
 * The values a story file's instances draw, from its drawing as the library has it (`plain`) and with the tags (`tagged`,
 * null when there are no tags to draw with). The two pair up instance by instance when both drew the same instances of the
 * same stories; when they do not, no value is said to be a token or not.
 */
export const readValues = (plain: Drawn, tagged: Drawn | null, tags: Tags | null): ComponentValues => {
	if (!plain.component) return { state: 'no-component' };
	const instances = plain.instances ?? [];
	if (instances.length === 0) return { state: 'none-drawn' };
	const twins = tagged?.instances;
	const paired = twins !== undefined && twins.length === instances.length && twins.every((t, i) => t.story === instances[i]?.story);
	const candidates = candidatesOf(instances, plain.controls ?? []);
	const rows: ValueRow[] = [];
	for (const property of VALUE_PROPERTIES) {
		const values = instances.map((i) => i.values[property] ?? '');
		// A property no instance draws anything of (no gap, no border, no background) is no row.
		if (values.every(isNothing)) continue;
		const entries = instances.map((instance, i) => ({
			instance,
			read: readOne(property, values[i] as string, paired ? (twins[i]?.values[property] ?? '') : null, tags),
		}));
		rows.push(rowOf(property, entries, candidates));
	}
	return { state: 'read', instances: instances.length, rows };
};
