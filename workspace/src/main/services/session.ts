import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The repositories this session has actually opened.
 *
 * Every operation takes a `root` from the renderer, so without this the renderer
 * could name any directory on the machine and have the main process read it, run
 * a command in it, or write to it. A root is only usable after the designer
 * opened it deliberately -- through the picker, or by an explicit open. The
 * renderer cannot add one.
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
