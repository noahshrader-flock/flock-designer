/**
 * What DSNR keeps of each change it has a branch for, in one file, by the design system and the change's scope (a component's
 * story file, or none for a change of the whole design system, its tokens): read, kept, forgotten, and listed for the design
 * system shown. Every kind of branch DSNR keeps is kept by it: a Save's (`ChangeBranches`) and a hand-over's (`HandoffBranches`).
 */
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

	/** The design system shown, or why there is none. */
	system(): ConnectedDesignSystem {
		const system = this.shown();
		if (system === null) throw new Error('There is no design system connected.');
		return system;
	}

	/** The record for `scope` on the design system shown, with it; or null. */
	read(scope: string): { system: ConnectedDesignSystem; kept: T } | null {
		const system = this.shown();
		if (!system) return null;
		const kept = this.file.read()[keyOf(system, scope)];
		return kept === undefined ? null : { system, kept };
	}

	keep(system: ConnectedDesignSystem, scope: string, kept: T): void {
		this.file.update((all) => ({ ...all, [keyOf(system, scope)]: kept }));
	}

	/** Forgets the record for `scope` on the design system shown; its branch, and any pull request, stay. */
	forget(scope: string): void {
		const system = this.shown();
		if (!system) return;
		const key = keyOf(system, scope);
		this.file.update((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== key)));
	}

	/** The scopes with a record on the design system shown; none for the one kept without a scope. */
	scopes(): string[] {
		const system = this.shown();
		if (!system) return [];
		const prefix = `${system.id}\u0000`;
		return Object.keys(this.file.read())
			.filter((k) => k.startsWith(prefix))
			.map((k) => k.slice(prefix.length));
	}
}

/** What a record is kept by: its design system, and its scope when it has one. */
const keyOf = (system: ConnectedDesignSystem, scope: string): string => (scope === '' ? system.id : `${system.id}\u0000${scope}`);
