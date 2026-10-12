import { type Appearance, asAppearance } from '../../shared/appearance';
import { asRecord } from '../../shared/json';
import { type JsonFile, jsonFile } from './jsonFile';

/**
 * The appearance the person chose (Settings), in its own small file in the app's settings, so the app opens the way it
 * was left. Checked on the way back in: a file that is edited, or cannot be read, is Auto, never a failure, and not
 * keeping it only means choosing again.
 */
export class AppearanceMemory {
	private readonly file: JsonFile<{ appearance: Appearance }>;

	constructor(path: string) {
		this.file = jsonFile(path, { parse: (raw) => ({ appearance: asAppearance(asRecord(raw).appearance) }), fallback: { appearance: 'system' } });
	}

	read(): Appearance {
		return this.file.read().appearance;
	}

	write(appearance: Appearance): void {
		this.file.write({ appearance });
	}
}
