/**
 * What a token change being tried reaches (Phase 3 of adjusting a component, DESIGN_SYSTEM.md): every component drawn on
 * a build with the change, against itself as the library has it, in light and in dark. Two ways, so neither says what is not
 * so: **by its values** (Phase 1's reading, instance by instance, by key), said as the Values say them; and **by everything
 * its stories draw** (every element's colours, radii and spacing, as T6 counts them), so a component whose change is in a part
 * its values do not read (an input's outline) is still said to move, as that. The rest are unchanged in the stories drawn.
 */
import type { ChangeReach, ComponentReach, ComponentValues, ValueChange, ValueProperty } from '../../shared/contract';
import { VALUE_PROPERTIES } from '../../shared/contract';
import type { Theme } from '../../shared/prototypeTheme';
import type { Drawn } from './componentTokens';
import { shown } from './componentValues';

/** A component's two drawings, light and dark; null for one that did not draw. */
export interface Drawings {
	light: Drawn | null;
	dark: Drawn | null;
}

/** Everything a drawing's stories draw, counted by value, as one text: equal when they draw the same. */
const counted = (d: Drawn): string => {
	const sorted = (m: Record<string, number>) => Object.entries(m).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return JSON.stringify([sorted(d.colors), sorted(d.radii), sorted(d.spacing)]);
};

/** The variant an instance is in a property's row, as the Values say it; null when the row has none, or no such row. */
const variantOf = (values: ComponentValues | undefined, mode: Theme, property: ValueProperty, key: string): string | null => {
	if (values?.state !== 'read') return null;
	const row = values.rows[mode]?.find((r) => r.property === property);
	return row?.cells.find((c) => c.targets.includes(key))?.variant ?? null;
};

/** What changed of a component's values in one mode, grouped by property, variant and from and to, in the order drawn. */
const changesIn = (mode: Theme, before: Drawn, after: Drawn, values: ComponentValues | undefined): ValueChange[] => {
	const was = new Map((before.instances ?? []).map((i) => [i.key, i]));
	const changes = new Map<string, ValueChange>();
	for (const property of VALUE_PROPERTIES) {
		for (const now of after.instances ?? []) {
			const then = was.get(now.key);
			if (!then) continue;
			const [from, to] = [shown(property, then.values[property] ?? ''), shown(property, now.values[property] ?? '')];
			if (from === to) continue;
			const variant = variantOf(values, mode, property, now.key);
			const id = JSON.stringify([property, variant, from, to]);
			const kept = changes.get(id);
			if (kept) kept.instances++;
			else changes.set(id, { mode, property, variant, from, to, instances: 1 });
		}
	}
	return [...changes.values()];
};

/**
 * What a change reaches, from each listed component's drawings as the library has them (`before`) and with the change
 * (`after`), with what its values were read as (`values`, which variant each instance is). A component that did not draw
 * in light either way has nothing to say of it and is listed apart; dark is compared where both drew.
 */
export const reachOf = (
	files: string[],
	before: ReadonlyMap<string, Drawings>,
	after: ReadonlyMap<string, Drawings>,
	values: ReadonlyMap<string, ComponentValues>,
): ChangeReach => {
	const moved: ComponentReach[] = [];
	const notDrawn: string[] = [];
	let unchanged = 0;
	for (const file of files) {
		const [was, now] = [before.get(file), after.get(file)];
		if (!was?.light || !now?.light) {
			notDrawn.push(file);
			continue;
		}
		const pairs: [Theme, Drawn, Drawn][] = [['light', was.light, now.light]];
		if (was.dark && now.dark) pairs.push(['dark', was.dark, now.dark]);
		const changes = pairs.flatMap(([mode, b, a]) => changesIn(mode, b, a, values.get(file)));
		const differs = pairs.some(([, b, a]) => counted(b) !== counted(a));
		if (changes.length === 0 && !differs) unchanged++;
		else moved.push({ file, changes, inside: changes.length === 0 });
	}
	return { state: 'ready', moved, unchanged, notDrawn };
};
