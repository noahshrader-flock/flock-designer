import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { readText, writeAtomic } from './jsonFile';

/**
 * The `dsnr` command's data folder, and how it finds the prototypes the extension builds, so a page made from the command
 * line is one the panel has, and the other way round: the extension leaves a note in that folder saying where its own
 * prototypes are (`tellCommandLine`), and the command reads it (`commandLinePrototypes`). With no note, as on a machine
 * with no extension, the command keeps its own.
 */

const NOTE = 'extension.json';

/** The person's application-data folder, as each system names it, with the command's folder in it. */
export const cliDataFolder = (
	name: string,
	{ platform = process.platform, env = process.env, home = homedir() }: { platform?: string; env?: NodeJS.ProcessEnv; home?: string } = {},
): string => {
	const appData =
		platform === 'darwin'
			? join(home, 'Library', 'Application Support')
			: platform === 'win32'
				? (env.APPDATA ?? join(home, 'AppData', 'Roaming'))
				: (env.XDG_CONFIG_HOME ?? join(home, '.config'));
	return join(appData, name);
};

/** Says, in the command's folder, where the extension builds prototypes. */
export const tellCommandLine = (folder: string, prototypes: string): void => writeAtomic(join(folder, NOTE), `${JSON.stringify({ prototypes })}\n`);

/** Where the command builds prototypes: the extension's folder, as its note says, while that is there; else the command's own. */
export const commandLinePrototypes = (folder: string): string => {
	const own = join(folder, 'prototypes');
	try {
		const said = (JSON.parse(readText(join(folder, NOTE)) ?? 'null') as { prototypes?: unknown } | null)?.prototypes;
		return typeof said === 'string' && isAbsolute(said) && existsSync(said) ? said : own;
	} catch {
		return own;
	}
};
