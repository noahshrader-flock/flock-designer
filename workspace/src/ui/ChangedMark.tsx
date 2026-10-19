/**
 * A changed or tried value's mark, on its row, its cell or its color's dot: a dot in the brand, said by what it is (`says`:
 * Changed, Tried). A change is what a person is doing, not something wrong; amber is for what needs a look (a warning), and
 * is never used to say a change. Inside something that says it already (a color's dot), it is hidden from assistive
 * technology (`said`).
 */
export const ChangedMark = ({ says, said = false }: { says: 'Changed' | 'Tried'; said?: boolean }) =>
	said ? (
		<span data-changed-mark={says} className="changed-mark" aria-hidden="true" />
	) : (
		<span data-changed-mark={says} className="changed-mark" role="img" aria-label={says} />
	);
