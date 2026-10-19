/** Every word typed is in `text`, ignoring case; plain text, never a pattern, and an empty search finds everything. */
export const matchesWords = (text: string, search: string): boolean => {
	const words = search.toLowerCase().split(/\s+/).filter(Boolean);
	const known = text.toLowerCase();
	return words.every((w) => known.includes(w));
};
