/**
 * What git names things by, said once. Hex, lower case, as git writes it; 64 characters in a repository on SHA-256.
 */

/** A commit as people and links give it: abbreviated (7 or more) or whole. */
export const COMMIT_PATTERN = '[0-9a-f]{7,64}';
/** An object (a commit, a blob) as git prints its whole name. */
export const OBJECT_ID_PATTERN = '(?:[0-9a-f]{40}|[0-9a-f]{64})';

export const isCommit = (value: unknown): value is string => typeof value === 'string' && new RegExp(`^${COMMIT_PATTERN}$`).test(value);
export const isObjectId = (value: unknown): value is string => typeof value === 'string' && new RegExp(`^${OBJECT_ID_PATTERN}$`).test(value);
