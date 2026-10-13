/**
 * What the panel's page may ask of the extension, and nothing else. The page is the extension's own, but what it sends is
 * still read as the app reads what its window sends: only a message it knows, in exactly that shape, so a page that went
 * wrong can ask for nothing new. No `vscode` import, so it is tested on its own.
 */
export type PanelMessage = { type: 'new-prototype' } | { type: 'locate-design-system' };

const TYPES = new Set<PanelMessage['type']>(['new-prototype', 'locate-design-system']);

/** The message, or null for anything that is not one exactly. */
export const readMessage = (raw: unknown): PanelMessage | null => {
	if (typeof raw !== 'object' || raw === null) return null;
	const keys = Object.keys(raw);
	const type = (raw as { type?: unknown }).type;
	return keys.length === 1 && typeof type === 'string' && TYPES.has(type as PanelMessage['type']) ? { type: type as PanelMessage['type'] } : null;
};

/** What the person is told, until what the message asks for is built (Phases 3 and 4 of the plan). */
export const replyTo = (message: PanelMessage): string =>
	message.type === 'new-prototype' ? 'Starting a prototype from DSNR is not built yet.' : 'Locating a design system from DSNR is not built yet.';
