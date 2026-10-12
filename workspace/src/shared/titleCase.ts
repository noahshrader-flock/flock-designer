/** Words a title keeps in lower case unless they begin or end it. */
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'the', 'to']);

/** A word with its first letter a capital, and nothing else changed: `light` is `Light`, `fsButton` is `FsButton`. */
export const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * A label in title case: each word begins with a capital, except the small words in the middle ("Voice and Tone"). Only the
 * first letter of a word is changed, so a name that is capitalized inside ("FSButton") is left as written.
 */
export const titleCase = (label: string): string => {
	const words = label.split(' ');
	return words
		.map((word, i) => {
			const small = SMALL.has(word.toLowerCase()) && i !== 0 && i !== words.length - 1;
			return small ? word.toLowerCase() : capitalize(word);
		})
		.join(' ');
};
