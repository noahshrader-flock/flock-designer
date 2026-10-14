import type { Context } from '../../src/main/services/findContext';
import { type DesignSystemsMemory, systemAt } from '../../src/main/services/designSystems';
import type { ConnectedDesignSystem } from '../../src/shared/contract';
import { errorText } from '../../src/shared/result';

const same = (a: ConnectedDesignSystem, b: ConnectedDesignSystem): boolean =>
	(Object.keys(a) as (keyof ConnectedDesignSystem)[]).every((k) => a[k] === b[k]);

/**
 * The design system VS Code found, told to the core as the one shown (ELECTRON_MIGRATION_PLAN 6.1): the core reads,
 * previews, pictures and changes the one it is told is shown, as it does the app's connected one, so the folder found is
 * read as connecting it would keep it (`systemAt`) and kept, only when it differs from the one shown. Says why when the
 * folder cannot be read that way; null otherwise, and when none was found.
 */
export const showFound = async (
	memory: Pick<DesignSystemsMemory, 'current' | 'add'>,
	found: Context['designSystem'],
	read: (root: string) => Promise<ConnectedDesignSystem> = systemAt,
): Promise<string | null> => {
	if (found === null) return null;
	let system: ConnectedDesignSystem;
	try {
		system = await read(found.root);
	} catch (err) {
		return errorText(err);
	}
	const shown = memory.current();
	if (shown === null || !same(shown, system)) memory.add(system);
	return null;
};
