import type { TriedValue, ValueProperty } from '../../../shared/contract';
import { COLOR_VALUES } from '../../../shared/contract';
import { hexOf } from '../../../shared/tokens';
import { allParts, partsIn } from '../../../shared/valueParts';
import type { Instance } from './componentTokens';

/** Colours are compared as hex, since the browser may write the same colour another way; lengths as written. */
export const same = (property: ValueProperty, a: string | undefined, b: string | undefined): boolean =>
	COLOR_VALUES.has(property) ? (a !== undefined && b !== undefined && hexOf(a) === hexOf(b)) || a === b : a === b;

export const partsBy = (instances: Instance[] | undefined, property: ValueProperty): Map<string, string[]> =>
	new Map((instances ?? []).map((i) => [i.key, allParts(i.values[property] ?? '', partsIn(property))]));

/** What an instance it was tried on draws instead (light theme only); null when every one draws the value. */
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
