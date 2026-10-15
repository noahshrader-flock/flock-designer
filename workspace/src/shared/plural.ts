/** What a count counts, in the number it is: `version` for one, `versions` for any other (a number drawn apart from it). */
export const counted = (n: number, word: string): string => `${word}${n === 1 ? '' : 's'}`;

/** A count and what it counts, as a person says it: `1 version`, `2 versions`, `0 comments`. */
export const plural = (n: number, word: string): string => `${n} ${counted(n, word)}`;
