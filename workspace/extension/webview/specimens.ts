import type { SpecimenLine } from '../../src/shared/catalog';
import type { DesignToken } from '../../src/shared/contract';
import { TYPE_PARTS } from '../../src/shared/primitives';
import { nameOf } from '../../src/shared/tokens';

/**
 * The lines of a type specimen, from the typography tokens: each family; each style that has a size, drawn in its own weight,
 * line height and family (else the first family); and each weight that belongs to no sized style. Nothing is guessed: a part a
 * style does not set is left to the page's own.
 */
export const typeSpecimens = (tokens: DesignToken[]): SpecimenLine[] => {
	const of = (group: string) => tokens.filter((t) => t.group === group);
	const families = of(TYPE_PARTS.family);
	const base = families[0]?.value;
	const inSet = (set: string, group: string) => tokens.find((t) => t.set === set && t.group === group)?.value;
	const sized = new Set(of(TYPE_PARTS.size).map((t) => t.set));
	const has = (line: SpecimenLine) => Object.fromEntries(Object.entries(line).filter(([, v]) => v !== undefined)) as unknown as SpecimenLine;
	return [
		...families.map((t) => ({ key: t.path, label: nameOf(t), family: t.value })),
		...[...sized].map((set) =>
			has({
				key: set,
				label: set,
				family: inSet(set, TYPE_PARTS.family) ?? base,
				size: inSet(set, TYPE_PARTS.size),
				weight: inSet(set, TYPE_PARTS.weight),
				lineHeight: inSet(set, TYPE_PARTS.lineHeight),
			}),
		),
		...of(TYPE_PARTS.weight)
			.filter((t) => !sized.has(t.set))
			.map((t) => has({ key: t.path, label: nameOf(t), family: base, weight: t.value })),
	];
};
