import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Offer, Tell } from './agentWork';

const ALLOW = 'Allow';
const NO = 'No thanks';

/** Figma's tools that only read, as Claude Code names them: what a build needs to read a frame, and nothing that can write. */
export const FIGMA_READ_RULES = [
	'mcp__claude_ai_Figma__get_design_context',
	'mcp__claude_ai_Figma__get_screenshot',
	'mcp__claude_ai_Figma__get_metadata',
	'mcp__claude_ai_Figma__get_variable_defs',
	'mcp__claude_ai_Figma__get_code_connect_map',
	'mcp__claude_ai_Figma__get_figma_skill',
] as const;

/** Whether a request names a Figma design, board, make file or slides by its address. */
export const mentionsFigma = (text: string): boolean => /(^|[/\s])(www\.)?figma\.com\/(design|board|make|slides)\//i.test(text);

type Settings = { permissions?: { allow?: unknown } } | null;

/** Whether each of the rules is allowed already, one by one or by allowing the whole Figma server. */
export const hasFigmaAccess = (settings: Settings): boolean => {
	const allow = settings?.permissions?.allow;
	if (!Array.isArray(allow)) return false;
	if (allow.includes('mcp__claude_ai_Figma') || allow.includes('mcp__claude_ai_Figma__*')) return true;
	return FIGMA_READ_RULES.every((rule) => allow.includes(rule));
};

/** Where Claude Code keeps the person's own settings: its folder in the home directory, or the one they told it to use. */
export const settingsPath = (home: string, env: Record<string, string | undefined>): string =>
	join(env.CLAUDE_CONFIG_DIR ?? join(home, '.claude'), 'settings.json');

/** The settings file, read and written as text: none when there is not one yet. */
export interface SettingsFile {
	read: (path: string) => Promise<string | null>;
	write: (path: string, text: string) => Promise<void>;
}

/** The settings file on disk: none when it does not exist, its folder made when it is first written. */
export const diskSettingsFile: SettingsFile = {
	read: (path) => readFile(path, 'utf8').catch((err: NodeJS.ErrnoException) => (err.code === 'ENOENT' ? null : Promise.reject(err))),
	write: async (path, text) => {
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, text);
	},
};

const parse = (text: string): { permissions?: { allow?: unknown } } & Record<string, unknown> => {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error('it could not be read as settings, so it was left as it is');
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value))
		throw new Error('it is not as settings are written, so it was left as it is');
	const allow = (value as { permissions?: { allow?: unknown } }).permissions?.allow;
	if (allow !== undefined && !Array.isArray(allow)) throw new Error('its allow list is not as settings are written, so it was left as it is');
	return value as Record<string, unknown>;
};

/**
 * Adds the read-only Figma rules to Claude Code's settings, keeping everything else as it is and in its order, and writing
 * nothing when they are all there. A file that cannot be read as settings is never overwritten: it throws, saying so.
 */
export const allowFigma = async (path: string, file: SettingsFile): Promise<void> => {
	const text = await file.read(path);
	const settings = text === null ? {} : parse(text);
	if (hasFigmaAccess(settings)) return;
	const allow = Array.isArray(settings.permissions?.allow) ? (settings.permissions?.allow as unknown[]) : [];
	const next = {
		...settings,
		permissions: { ...settings.permissions, allow: [...allow, ...FIGMA_READ_RULES.filter((rule) => !allow.includes(rule))] },
	};
	await file.write(path, `${JSON.stringify(next, null, 2)}\n`);
};

/**
 * Offered once, at the bottom, when a request has a Figma link: Claude Code asks before every Figma call, so a build that
 * reads a frame stops to ask. On Allow the read-only rules are added to the person's own Claude Code settings; on No thanks
 * it is never asked again; a dismissed offer is asked again next time. Not asked when it is already allowed.
 */
export const offerFigmaAccess = async (
	request: string,
	deps: SettingsFile & {
		path: string;
		declined: { get: () => boolean; set: () => Promise<void> };
		offer: Offer;
		tell: Tell;
	},
): Promise<void> => {
	if (!mentionsFigma(request) || deps.declined.get()) return;
	const current = await deps.read(deps.path).catch(() => null);
	let settings: Settings = null;
	try {
		settings = current === null ? null : parse(current);
	} catch {
		// Not readable as settings: it is offered anyway, and said not to be possible when it is accepted.
	}
	if (hasFigmaAccess(settings)) return;
	const asked = await deps.offer(
		'This build reads a Figma frame through Claude Code, which asks before each Figma call. Allow its read-only Figma tools so it does not ask? Adds six rules to ~/.claude/settings.json; nothing can be written or changed in Figma.',
		[ALLOW, NO],
	);
	if (asked === NO) return deps.declined.set();
	if (asked !== ALLOW) return;
	try {
		await allowFigma(deps.path, deps);
		deps.tell('Claude Code will read Figma frames without asking. Added to ~/.claude/settings.json: take them out there any time.');
	} catch (err) {
		const why = err instanceof Error ? err.message : String(err);
		deps.tell(
			`The Figma rules could not be added to ${deps.path}: ${why}. Add these to "permissions": { "allow": [...] } there by hand: ${FIGMA_READ_RULES.join(', ')}.`,
		);
	}
};
