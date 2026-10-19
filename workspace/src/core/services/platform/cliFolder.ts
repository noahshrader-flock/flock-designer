import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { readText, writeAtomic } from './jsonFile';

const NOTE = 'extension.json';

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

/** So the `dsnr` command and the panel share one set of prototypes. */
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
