import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Joins class names, letting a later Tailwind class beat an earlier one that sets the same thing.
 * Plain string concatenation cannot: `px-2 px-4` leaves both, and which wins is down to the order
 * they happen to appear in the stylesheet.
 */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
