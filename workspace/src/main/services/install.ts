import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkspaceCommand } from '../../shared/contract';

/**
 * Installing a repository's packages from the New modal (C5 of the clone plan).
 *
 * **Only the command the repository declares** (`install` in its `.flkd/workspace.json`), as every command the app runs
 * is: the repository's owners decide how it installs, and the person asks for it with one click. It runs with the
 * person's own registry sign-in, as their terminal would; when the private registry refuses, it says how to sign in.
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

/** What went wrong, in words a person can act on. `node` is the version the repository asks for, when it says. */
export const installProblem = (output: string, node: string | null): string => {
	const refused = refusal(output);
	if (refused?.registry?.includes('npm.pkg.github.com')) {
		return `npm on this computer is not signed in to GitHub Packages, where the private packages are. Sign in with \`npm login --auth-type=legacy --registry=https://npm.pkg.github.com\`, using a GitHub token that can read packages (and is authorised for your organisation's single sign-on), then try again.`;
	}
	if (refused) return `${refused.registry ?? 'The package registry'} refused npm on this computer. Sign in to it as your team does, then try again.`;
	if (/ENOSPC|no space left/i.test(output)) return 'There is not enough disk space to install the packages. Free some, then try again.';
	if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/.test(output)) return 'Could not reach the package registry. Check the internet connection, then try again.';
	if (/EBADENGINE|Unsupported engine/i.test(output) && node) return `The packages need Node ${node}, and this computer has another. Install Node ${node}, then try again.`;
	const last = output.trim().split('\n').filter(Boolean).slice(-3).join(' ');
	return `The packages did not install: ${last || 'it stopped without saying why.'}`;
};

/** The Node version a repository asks for in `.nvmrc`, for the messages. */
const nodeVersionOf = (root: string): string | null => {
	const file = join(root, '.nvmrc');
	return existsSync(file) ? readFileSync(file, 'utf8').trim() || null : null;
};

/**
 * One install at a time, as one clone and one agent run at a time. `onLine` is given each line of its output, for the
 * window to show how far it has got; `signal` stops it.
 */
export class Installer {
	private running: string | null = null;

	async install(root: string, command: WorkspaceCommand, onLine: (line: string) => void = () => undefined, signal?: AbortSignal): Promise<void> {
		if (this.running !== null) throw new InstallProblem(`Already installing in ${this.running}. Wait for it to finish.`);
		const [file, ...args] = command.argv;
		if (file === undefined) throw new InstallProblem('The repository declares an install command with nothing in it.');
		this.running = root;
		try {
			await new Promise<void>((done, fail) => {
				const child = spawn(file, args, { cwd: root, shell: false, stdio: ['ignore', 'pipe', 'pipe'], env: process.env, ...(signal ? { signal } : {}) });
				let output = '';
				const read = (chunk: Buffer) => {
					const text = chunk.toString('utf8');
					output = (output + text).slice(-32_000);
					for (const line of text.split(/[\r\n]+/)) if (line.trim()) onLine(line.trim());
				};
				child.stdout.on('data', read);
				child.stderr.on('data', read);
				child.on('error', (err: NodeJS.ErrnoException) => {
					if (signal?.aborted) return fail(new InstallProblem('The install was stopped. Run it again to finish it.'));
					const node = nodeVersionOf(root);
					fail(
						new InstallProblem(
							err.code === 'ENOENT'
								? `${file} was not found on this computer. Install Node.js${node ? ` (this repository asks for ${node})` : ''} from https://nodejs.org, then try again.`
								: `Could not run ${file}: ${err.message}`,
						),
					);
				});
				child.on('close', (code) => {
					if (signal?.aborted) return fail(new InstallProblem('The install was stopped. Run it again to finish it.'));
					if (code === 0) done();
					else fail(new InstallProblem(installProblem(output, nodeVersionOf(root))));
				});
			});
		} finally {
			this.running = null;
		}
	}
}
