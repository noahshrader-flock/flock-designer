/** Never amber, since a change is not something wrong. `said` hides it from assistive technology inside what says it already. */
export const ChangedMark = ({ says, said = false }: { says: 'Changed' | 'Tried'; said?: boolean }) =>
	said ? (
		<span data-changed-mark={says} className="changed-mark" aria-hidden="true" />
	) : (
		<span data-changed-mark={says} className="changed-mark" role="img" aria-label={says} />
	);
