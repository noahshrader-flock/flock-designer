import { randomBytes } from 'node:crypto';

/**
 * The branches DSNR makes to keep a change on (`dsnr/<kind>-<day>-<4 hex>`). Named one way, so the pattern that keeps a
 * save off anyone else's work is one pattern.
 */
export const dsnrBranchPattern = (kind: string): RegExp => new RegExp(`^dsnr/${kind}-\\d{8}-[0-9a-f]{4}$`);

/** A new one: the day, and four letters so two on one day differ. */
export const newDsnrBranch = (kind: string, now: Date): string =>
	`dsnr/${kind}-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(2).toString('hex')}`;
