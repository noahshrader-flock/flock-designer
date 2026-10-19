import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkspaceCommand } from '../projects/descriptor';
import { NotStarted, Stopped, runStreamed } from '../platform/streamed';
import { HOST } from '../../../shared/vocabulary';

/**
 * Runs only the command the repository declares (`install` in its `.dsnr/workspace.json`), as with every command DSNR runs.
 */

export const INSTALL_COMMAND = 'install';

export class InstallProblem extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InstallProblem';
	}
}

/** Whether npm was refused by a registry, and which: `npm error 401 Unauthorized - GET https://npm.pkg.github.com/…`. */
const refusal = (output: string): { registry: string | null } | null => {
	if (!/\bE40[13]\b|\b40[13] (Unauthorized|Forbidden)\b/.test(output)) return null;
	const line = output.split('\n').find((l) => /\b40[13] (Unauthorized|Forbidden)\b/.test(l)) ?? '';
	return { registry: /https:\/\/[^/\s]+/.exec(line)?.[0] ?? null };
};

/** `node` is the version the repository asks for, when it says. */
export const installProblem = (output: string, node: string | null): string => {
	const refused = refusal(output);
	if (refused?.registry?.includes('npm.pkg.github.com')) {
		return `npm on this computer is not signed in to GitHub Packages, where the private packages are. Sign in with \`npm login --auth-type=legacy --registry=https://npm.pkg.github.com\`, using a ${HOST} token that can read packages (and is authorized for your organization's single sign-on), then try again.`;
	}
	if (refused) return `${refused.registry ?? 'The package registry'} refused npm on this computer. Sign in to it as your team does, then try again.`;
	if (/ENOSPC|no space left/i.test(output)) return 'There is not enough disk space to install the packages. Free some, then try again.';
	if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/.test(output))
		return 'Could not reach the package registry. Check the internet connection, then try again.';
	if (/EBADENGINE|Unsupported engine/i.test(output) && node)
		return `The packages need Node ${node}, and this computer has another. Install Node ${node}, then try again.`;
	const last = output.trim().split('\n').filter(Boolean).slice(-3).join(' ');
	return `The packages did not install: ${last || 'it stopped without saying why.'}`;
};

const nodeVersionOf = (root: string): string | null => {
	const file = join(root, '.nvmrc');
	return existsSync(file) ? readFileSync(file, 'utf8').trim() || null : null;
};

export class Installer {
	private running: string | null = null;

	async install(root: string, command: WorkspaceCommand, onLine: (line: string) => void = () => undefined, signal?: AbortSignal): Promise<void> {
		if (this.running !== null) throw new InstallProblem(`Already installing in ${this.running}. Wait for it to finish.`);
		const [file, ...args] = command.argv;
		if (file === undefined) throw new InstallProblem('The repository declares an install command with nothing in it.');
		this.running = root;
		try {
			const { code, output } = await runStreamed(file, args, {
				cwd: root,
				signal,
				onText: (text) => {
					for (const line of text.split(/[\r\n]+/)) if (line.trim()) onLine(line.trim());
				},
			});
			if (code !== 0) throw new InstallProblem(installProblem(output, nodeVersionOf(root)));
		} catch (err) {
			if (err instanceof Stopped) throw new InstallProblem('The install was stopped. Run it again to finish it.');
			if (err instanceof NotStarted && err.missing) {
				const node = nodeVersionOf(root);
				throw new InstallProblem(
					`${file} was not found on this computer. Install Node.js${node ? ` (this repository asks for ${node})` : ''} from https://nodejs.org, then try again.`,
				);
			}
			throw err instanceof InstallProblem || !(err instanceof Error) ? err : new InstallProblem(err.message);
		} finally {
			this.running = null;
		}
	}
}
