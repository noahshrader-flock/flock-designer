/** No React, so it is tested alone. */
import type { ValueCell, ValueProperty, ValueRow } from '../../src/shared/contract';
import { VALUE_NAMES } from '../../src/shared/valueNames';

/** The groups, in their order, and the rows in each: every property a component's values have is in one. */
export const GROUPS = [
	{ name: 'Layout', properties: ['height', 'padding', 'gap'] },
	{ name: 'Typography', properties: ['fontSize'] },
	{ name: 'Appearance', properties: ['radius'] },
	{ name: 'Fill', properties: ['background'] },
	{ name: 'Text', properties: ['text'] },
	{ name: 'Stroke', properties: ['border'] },
] as const satisfies readonly { name: string; properties: readonly ValueProperty[] }[];

export const rowName = (property: ValueProperty): string => (property === 'text' ? 'Text color' : VALUE_NAMES[property]);

/**
 * A prop the variant shown is chosen by: its values in the order first drawn, null for drawn without it (its default); a
 * switch when every value it is drawn with is true, false or none.
 */
export interface Picker {
	prop: string;
	options: (string | null)[];
	switch: boolean;
}

/** The variant shown: a value for each picker's prop. A switch is on as `'true'`, off as anything else. */
export type Selection = Record<string, string | null>;

export const pickersOf = (rows: ValueRow[]): Picker[] => {
	const seen = new Map<string, (string | null)[]>();
	for (const cell of rows.flatMap((r) => r.cells))
		for (const drawn of cell.of ?? [])
			for (const [prop, value] of Object.entries(drawn)) {
				const values = seen.get(prop) ?? [];
				if (!values.includes(value)) values.push(value);
				seen.set(prop, values);
			}
	return [...seen].map(([prop, options]) => ({ prop, options, switch: options.every((v) => v === 'true' || v === 'false' || v === null) }));
};

export const offOf = (picker: Picker): string | null => (picker.options.includes('false') ? 'false' : null);

export const firstSelection = (pickers: Picker[]): Selection =>
	Object.fromEntries(pickers.map((p) => [p.prop, p.switch ? offOf(p) : (p.options[0] ?? null)]));

export const optionLabel = (value: string | null): string => value ?? 'default';

export const propLabel = (prop: string): string => prop.charAt(0).toUpperCase() + prop.slice(1);

const chosen = (picker: Picker | undefined, drawn: string | null, value: string | null): boolean =>
	picker?.switch ? (drawn === 'true') === (value === 'true') : drawn === value;

/** `still`: drawn only from its props, so shown and never tried. With no case drawn, none and the nearest: never guessed. */
export type Shown = { cell: ValueCell; more: ValueCell[]; still: boolean } | { cell: null; nearest: ValueCell | null };

export const shownFor = (row: ValueRow, pickers: Picker[], selection: Selection): Shown => {
	const told = row.cells.some((c) => c.of !== undefined);
	if (!told) return { cell: row.cells[0] as ValueCell, more: row.cells.slice(1), still: false };
	const byProp = new Map(pickers.map((p) => [p.prop, p]));
	const score = (c: ValueCell) =>
		Math.max(
			0,
			...(c.of ?? []).map((drawn) => Object.entries(drawn).filter(([prop, v]) => chosen(byProp.get(prop), v, selection[prop] ?? null)).length),
		);
	const all = (c: ValueCell) =>
		(c.of ?? []).some((drawn) => Object.entries(drawn).every(([prop, v]) => chosen(byProp.get(prop), v, selection[prop] ?? null)));
	const cell = row.cells.find(all);
	if (cell) return { cell, more: [], still: false };
	const nearest = row.cells.reduce<ValueCell | null>((best, c) => (best === null || score(c) > score(best) ? c : best), null);
	return { cell: null, nearest };
};

const shownOf = (row: ValueRow | undefined, declared: ValueRow | undefined, pickers: Picker[], selection: Selection): Shown | null => {
	const drawn = row ? shownFor(row, pickers, selection) : null;
	if (drawn?.cell) return drawn;
	const fromProps = declared ? shownFor(declared, pickers, selection) : null;
	if (fromProps?.cell) return { ...fromProps, still: true };
	return drawn ?? fromProps;
};

export const inspect = (
	rows: ValueRow[],
	pickers: Picker[],
	selection: Selection,
	declared: ValueRow[] = [],
): { name: string; rows: { row: ValueRow; shown: Shown }[] }[] =>
	GROUPS.map((g) => ({
		name: g.name,
		rows: g.properties.flatMap((p) => {
			const row = rows.find((r) => r.property === p);
			const fromProps = declared.find((r) => r.property === p);
			const shown = shownOf(row, fromProps, pickers, selection);
			return shown ? [{ row: (row ?? fromProps) as ValueRow, shown }] : [];
		}),
	})).filter((g) => g.rows.length > 0);
