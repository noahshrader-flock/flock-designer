import { randomBytes } from 'node:crypto';

export const dsnrBranchPattern = (kind: string): RegExp => new RegExp(`^dsnr/${kind}-\\d{8}-[0-9a-f]{4}$`);

export const newDsnrBranch = (kind: string, now: Date): string =>
	`dsnr/${kind}-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(2).toString('hex')}`;
