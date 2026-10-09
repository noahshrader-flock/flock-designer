/** A count and what it counts, as a person says it: `1 version`, `2 versions`, `0 comments`. */
export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;
