import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Remembers which product checkout a person chose, so they choose it once.
 *
 * Only the path is kept, and only as a hint: it is re-checked on every launch
 * and goes through the same "opened" gate as a fresh pick, so a stale or edited
 * file can reopen nothing the person could not have opened themselves.
 */
export class CheckoutMemory {
	constructor(private readonly file: string) {}

	static defaultPath = (userData: string): string => join(userData, 'checkout.json');

	read(): string | null {
		try {
			const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as { root?: unknown };
			return typeof parsed.root === 'string' ? parsed.root : null;
		} catch {
			return null;
		}
	}

	write(root: string): void {
		try {
			mkdirSync(dirname(this.file), { recursive: true });
			writeFileSync(this.file, JSON.stringify({ root }));
		} catch {
			// Not remembering is an inconvenience, never a reason to fail the open.
		}
	}
}
