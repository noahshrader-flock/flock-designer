/** The word alone, for a number drawn apart from it: `version` for one, `versions` for any other count. */
export const counted = (n: number, word: string): string => `${word}${n === 1 ? '' : 's'}`;

export const plural = (n: number, word: string): string => `${n} ${counted(n, word)}`;
