/**
 * Whether what is typed in a search finds a thing, by the text it is known by: every word typed is in it, without regard to
 * case. Plain text, never a pattern; an empty search finds everything. One rule for every search over a list (projects,
 * components), so they behave alike.
 */
export const matchesWords = (text: string, search: string): boolean => {
	const words = search.toLowerCase().split(/\s+/).filter(Boolean);
	const known = text.toLowerCase();
	return words.every((w) => known.includes(w));
};
