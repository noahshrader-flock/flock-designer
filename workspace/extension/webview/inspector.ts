/**
 * A component's values as an inspector reads them: the variant shown chosen with a picker for each prop its rows are told
 * apart by, and each row's value for that choice, in the groups a designer knows. No React, so it is tested alone.
 */
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

/** How a row is named in its group: as the Values name it, but Text's color, in a group called Text. */
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

/** Every prop any row is told apart by, in the order first met, each with its values in the order first drawn. */
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

/** A switch's off: false when it was drawn so, else drawn without it. */
export const offOf = (picker: Picker): string | null => (picker.options.includes('false') ? 'false' : null);

/** What it opens on: each prop's first value drawn, and a switch off, as a component is at rest. */
export const firstSelection = (pickers: Picker[]): Selection =>
	Object.fromEntries(pickers.map((p) => [p.prop, p.switch ? offOf(p) : (p.options[0] ?? null)]));

/** How a picker's value is said: its default when drawn without it. */
export const optionLabel = (value: string | null): string => value ?? 'default';

/** How a prop is said as a picker's name: `size` is Size. */
export const propLabel = (prop: string): string => prop.charAt(0).toUpperCase() + prop.slice(1);

/** Whether a case drawn has `prop` as chosen: a switch's off is false or drawn without, alike. */
const chosen = (picker: Picker | undefined, drawn: string | null, value: string | null): boolean =>
	picker?.switch ? (drawn === 'true') === (value === 'true') : drawn === value;

/**
 * A row's value for the variant shown: the cell drawn with it, and for a row no prop tells apart, the value most instances
 * draw, with the others (`more`); `still` when drawn only from its props, so shown and never tried; or, when no case was
 * drawn with it, none, with the nearest (the cell with the most of it). Never guessed.
 */
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

/**
 * A row's value from its stories' drawing, else from its props' (`declared`: each declared value drawn on one
 * story), shown as still; a property only the props' drawing has is shown from it alone.
 */
const shownOf = (row: ValueRow | undefined, declared: ValueRow | undefined, pickers: Picker[], selection: Selection): Shown | null => {
	const drawn = row ? shownFor(row, pickers, selection) : null;
	if (drawn?.cell) return drawn;
	const fromProps = declared ? shownFor(declared, pickers, selection) : null;
	if (fromProps?.cell) return { ...fromProps, still: true };
	return drawn ?? fromProps;
};

/**
 * The groups with a row in them, each row with its value for the variant shown: from its stories' drawing (`rows`), and for a
 * case only its props declare, from their drawing (`declared`), shown and never tried.
 */
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
