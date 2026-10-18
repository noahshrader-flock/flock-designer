/**
 * How a value written into the library is read back (Phase 4 of adjusting a component), one way for every writer: where
 * it is found (`ValueSources`), and what the agent writes (`ValueAgent`). The instances it was tried on are drawn with the
 * write, and each must draw what was asked, part by part.
 */
import type { TriedValue, ValueProperty } from '../../shared/contract';
import { COLOR_VALUES } from '../../shared/contract';
import { hexOf } from '../../shared/tokens';
import { allParts, partsIn } from '../../shared/valueParts';
import type { Instance } from './componentTokens';

/** Two drawn parts are the same: colours as hex, whatever way the browser wrote them; lengths as written. */
export const same = (property: ValueProperty, a: string | undefined, b: string | undefined): boolean =>
	COLOR_VALUES.has(property) ? (a !== undefined && b !== undefined && hexOf(a) === hexOf(b)) || a === b : a === b;

/** Each instance's parts of a property, by its key. */
export const partsBy = (instances: Instance[] | undefined, property: ValueProperty): Map<string, string[]> =>
	new Map((instances ?? []).map((i) => [i.key, allParts(i.values[property] ?? '', partsIn(property))]));

/** What a value draws instead of `asked` (its value, unless given), on an instance it was tried on, light; null when every one draws it. */
export const drawsOtherwise = (
	t: Pick<TriedValue, 'property' | 'targets'> & { value: string },
	drawn: { light: { instances?: Instance[] } | null } | undefined,
): string | null => {
	const asked = allParts(t.value, partsIn(t.property));
	const now = partsBy(drawn?.light?.instances, t.property);
	for (const key of t.targets) {
		const parts = now.get(key);
		if (parts === undefined) return 'nothing it can be read on';
		if (!asked.every((p, i) => same(t.property, parts[i], p))) return parts.join(' ');
	}
	return null;
};
