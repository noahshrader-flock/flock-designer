import { useEffect, useState } from 'react';
import type { Prototype } from '../../../src/shared/contract';
import { coverToShow } from '../../../src/shared/prototypeList';
import { workspace } from '../host';
import { askOnce } from './ask';

/** Pictures already read, by what names them: what a picture's name names never changes, so one shown again has it at once. */
const read = new Map<string, string>();

export const useCover = (prototype: Prototype): { picture: string | undefined; waiting: boolean } => {
	const shown = coverToShow(prototype);
	const key = shown === null ? null : `${prototype.id}/${shown.name}/${shown.cover}`;
	const [answer, setAnswer] = useState<{ key: string; picture: string | null } | null>(null);
	useEffect(() => {
		if (shown === null || key === null || read.has(key)) return;
		return askOnce(
			() => workspace().prototypeCover(prototype.id, shown.name, shown.cover),
			(r) => {
				const picture = r.ok ? r.value : null;
				if (picture !== null) read.set(key, picture);
				setAnswer({ key, picture });
			},
		);
		// Asked again only when the picture is another: the key is the prototype, its prototype and the hash.
	}, [key]); // eslint-disable-line react-hooks/exhaustive-deps
	if (key === null) return { picture: undefined, waiting: false };
	const known = read.get(key) ?? (answer?.key === key ? answer.picture : undefined);
	return { picture: known ?? undefined, waiting: known === undefined };
};
