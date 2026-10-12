import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type Appearance, asAppearance } from '../../shared/appearance';

/**
 * The appearance the person chose (Settings), in its own small file in the app's settings, so the app opens the way it
 * was left. Checked on the way back in: a file that is edited, or cannot be read, is Auto, never a failure, and not
 * keeping it only means choosing again.
 */
export class AppearanceMemory {
	constructor(private readonly file: string) {}

	static defaultPath = (userData: string): string => join(userData, 'appearance.json');

	read(): Appearance {
		try {
			return asAppearance((JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, unknown>).appearance);
		} catch {
			return 'system';
		}
	}

	write(appearance: Appearance): void {
		try {
			mkdirSync(dirname(this.file), { recursive: true });
			writeFileSync(this.file, JSON.stringify({ appearance }));
		} catch {
			// Chosen again next time.
		}
	}
}
