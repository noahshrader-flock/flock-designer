import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The repositories this session has opened. Every operation takes a `root` from a page, so without this a page could
 * have the core read, run in or write to any directory. Only the designer's own open (the picker, an explicit open) adds one.
 */
export class OpenedCheckouts {
	private readonly roots = new Set<string>();

	private static canonical(root: string): string {
		try {
			return realpathSync(resolve(root));
		} catch {
			return resolve(root);
		}
	}

	remember(root: string): string {
		const canonical = OpenedCheckouts.canonical(root);
		this.roots.add(canonical);
		return canonical;
	}

	/** Returns the canonical root, or throws. Call this before touching the disk. */
	require(root: string): string {
		const canonical = OpenedCheckouts.canonical(root);
		if (!this.roots.has(canonical)) {
			throw new Error('That repository is not open in this window. Open it first.');
		}
		return canonical;
	}

	has(root: string): boolean {
		return this.roots.has(OpenedCheckouts.canonical(root));
	}
}
