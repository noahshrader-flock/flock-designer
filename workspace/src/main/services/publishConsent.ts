import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * The person's one-time answer to "may Flock Designer publish my work automatically?".
 *
 * Kept per machine, in the app's own settings, and only as a yes or a no: null means they have not
 * been asked, which is different from no, because "no" must never be asked again unprompted.
 */
export class PublishConsent {
	constructor(private readonly file: string) {}

	static defaultPath = (userData: string): string => join(userData, 'publish.json');

	read(): boolean | null {
		try {
			const parsed = JSON.parse(readFileSync(this.file, 'utf8')) as { allowed?: unknown };
			return typeof parsed.allowed === 'boolean' ? parsed.allowed : null;
		} catch {
			return null;
		}
	}

	write(allowed: boolean): void {
		mkdirSync(dirname(this.file), { recursive: true });
		writeFileSync(this.file, JSON.stringify({ allowed }));
	}

	exists(): boolean {
		return existsSync(this.file);
	}
}
