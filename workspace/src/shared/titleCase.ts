const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'nor', 'of', 'on', 'or', 'the', 'to']);

/** Nothing but the first letter changes: `fsButton` is `FsButton`. */
export const capitalize = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1);

/** Only the first letter of a word is changed, so a name capitalized inside ("FSButton") is left as written. */
export const titleCase = (label: string): string => {
	const words = label.split(' ');
	return words
		.map((word, i) => {
			const small = SMALL.has(word.toLowerCase()) && i !== 0 && i !== words.length - 1;
			return small ? word.toLowerCase() : capitalize(word);
		})
		.join(' ');
};
