import type { DesignTab } from '../src/messages';

export const readTab = (said: string | undefined): DesignTab | null => {
	if (said === undefined) return null;
	try {
		const t = JSON.parse(said) as Record<string, unknown>;
		if (t.kind === 'primitives') return { kind: 'primitives' };
		if (t.kind === 'component' && typeof t.id === 'string' && typeof t.name === 'string') return { kind: 'component', id: t.id, name: t.name };
	} catch {
		// Not a tab: the panel.
	}
	return null;
};
