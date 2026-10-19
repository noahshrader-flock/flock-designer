import type { ConnectedDesignSystem } from '../../../shared/contract';
import { type JsonFile, jsonFile } from '../platform/jsonFile';

export class ScopedRecords<T> {
	private readonly file: JsonFile<Record<string, T>>;

	/** `parse` keeps only the records that are whole and DSNR's own; anything else in the file is left out. */
	constructor(
		private readonly shown: () => ConnectedDesignSystem | null,
		path: string,
		parse: (raw: unknown) => Record<string, T>,
	) {
		this.file = jsonFile(path, { parse, fallback: {} });
	}

	system(): ConnectedDesignSystem {
		const system = this.shown();
		if (system === null) throw new Error('There is no design system connected.');
		return system;
	}

	read(scope: string): { system: ConnectedDesignSystem; kept: T } | null {
		const system = this.shown();
		if (!system) return null;
		const kept = this.file.read()[keyOf(system, scope)];
		return kept === undefined ? null : { system, kept };
	}

	keep(system: ConnectedDesignSystem, scope: string, kept: T): void {
		this.file.update((all) => ({ ...all, [keyOf(system, scope)]: kept }));
	}

	/** Its branch, and any pull request, stay. */
	forget(scope: string): void {
		const system = this.shown();
		if (!system) return;
		const key = keyOf(system, scope);
		this.file.update((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== key)));
	}

	/** The whole-design-system record's scope is `''`. */
	scopes(): string[] {
		const system = this.shown();
		if (!system) return [];
		const prefix = `${system.id}\u0000`;
		return Object.keys(this.file.read())
			.filter((k) => k.startsWith(prefix))
			.map((k) => k.slice(prefix.length));
	}
}

const keyOf = (system: ConnectedDesignSystem, scope: string): string => `${system.id}\u0000${scope}`;
