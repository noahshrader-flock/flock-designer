/** Hex, lower case, as git writes it; 64 characters in a repository on SHA-256. */

export const COMMIT_PATTERN = '[0-9a-f]{7,64}';
export const OBJECT_ID_PATTERN = '(?:[0-9a-f]{40}|[0-9a-f]{64})';

export const isCommit = (value: unknown): value is string => typeof value === 'string' && new RegExp(`^${COMMIT_PATTERN}$`).test(value);
export const isObjectId = (value: unknown): value is string => typeof value === 'string' && new RegExp(`^${OBJECT_ID_PATTERN}$`).test(value);
