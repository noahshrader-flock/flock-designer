/** Reading JSON whose shape is not promised (GitHub's answers, files people can edit) without trusting it. */

/** An object's fields, or none when it is not an object. */
export const asRecord = (value: unknown): Record<string, unknown> => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {});

/** A list, or an empty one when it is not a list. */
export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
