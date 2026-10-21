import { useEffect, useState } from 'react';
import type { EditedInCode } from '../../../src/shared/contract';
import { workspace } from '../host';
import { askWhile } from './ask';

/** Often enough to follow the person or an agent editing; it is a few git reads. */
export const READ_EVERY_MS = 5_000;

/** Read again for as long as the panel is open, and not while it is hidden; an answer that says the same keeps the last. */
export const useEditedInCode = (commit: string): EditedInCode => {
	const [edited, setEdited] = useState<EditedInCode>({ state: 'none' });
	useEffect(
		() =>
			askWhile(
				() => (document.hidden ? Promise.resolve(null) : workspace().editedInCode()),
				() => true,
				(r) => r?.ok && setEdited((was) => (JSON.stringify(was) === JSON.stringify(r.value) ? was : r.value)),
				{ every: READ_EVERY_MS, for: Number.POSITIVE_INFINITY },
			),
		[commit],
	);
	return edited;
};
