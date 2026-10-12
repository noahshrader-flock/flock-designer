import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import type { CloneProgress } from '../../shared/contract';
import { clonePlace } from './cloneFolder';
import { listedAs } from './repositories';
import { NotStarted, Stopped, runStreamed } from './streamed';

/**
 * Cloning a repository the person chose from their own GitHub list into their clone folder (C2 of the clone plan).
 *
 * **Never over anything.** The place is asked of `clonePlace` first: a clone of the same repository already there is
 * used, anything else there is refused. The folder is made here, and on a failure or a cancel only that folder is
 * removed, and only while it is still the folder this made. Git signs in as the person's own git does, as it does for
 * a push; with no terminal to ask in, it fails at once rather than waiting, and the message says how to fix it.
 */

export interface CloneRequest {
	/** `owner/repo`, which must be in `visible`. */
	repository: string;
	/** The repositories the person's GitHub list returned. Only these are cloned. */
	visible: string[];
	/** The clone folder: the repository goes in `<folder>/<repo>`. */
	folder: string;
}

/** Where git has got to: its phase as it says it ("Receiving objects"), and how far through that phase. */
export type GitProgress = Omit<CloneProgress, 'repository'>;

export type Cloned = { path: string; cloned: boolean };

export interface CloneDeps {
	/** The address git clones from. GitHub's, except in tests. */
	urlOf?: (repository: string) => string;
	/** The git to run. */
	git?: string;
}

export class CloneProblem extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CloneProblem';
	}
}

const GIT_MISSING =
	'Git is not installed on this computer, and cloning needs it. On a Mac, install it with `xcode-select --install` in Terminal, or from https://git-scm.com. On Windows, install Git for Windows from https://git-scm.com. Then try again.';

/** What is said when something is in the way: it is never cloned over. */
export const notClonedOver = (why: string): string => `${why} Nothing was cloned over it. Change where clones go, or move it.`;

/** What git said, in words a person can act on. `repository` names what was being cloned. */
export const cloneProblem = (repository: string, stderr: string): string => {
	const said =
		stderr
			.trim()
			.split('\n')
			.filter((l) => !/^(Cloning into|remote: (Enumerating|Counting|Compressing|Total))/.test(l))
			.pop() ?? '';
	if (
		/Authentication failed|could not read (Username|Password)|terminal prompts disabled|Repository not found|Permission denied \(publickey\)|403/i.test(
			stderr,
		)
	) {
		return `GitHub would not let git on this computer clone ${repository}: git is not signed in to GitHub, or this account cannot read it. Run \`gh auth setup-git\` in a terminal (with the GitHub CLI signed in), or sign in to git, then try again.`;
	}
	if (/Could not resolve host|Failed to connect|Connection (timed out|refused|reset)|Network is unreachable|unable to access/i.test(stderr)) {
		return `Could not reach GitHub to clone ${repository}. Check the internet connection, then try again.`;
	}
	if (/No space left on device|disk full/i.test(stderr)) return `There is not enough disk space to clone ${repository}. Free some, then try again.`;
	return `Could not clone ${repository}: ${said || 'git stopped without saying why.'}`;
};

/** A line of git's progress, as `--progress` writes it: `Receiving objects:  45% (450/1000), 1.20 MiB | 2.00 MiB/s`. */
export const readProgress = (line: string): GitProgress | null => {
	const m = /^(?:remote: )?([A-Z][a-z]+(?: [a-z]+)*):\s+(\d{1,3})%/.exec(line.trim());
	return m ? { step: m[1] as string, percent: Number(m[2]) } : null;
};

const sameFolder = (dir: string, made: { dev: number; ino: number }): boolean => {
	try {
		const s = statSync(dir);
		return s.isDirectory() && s.dev === made.dev && s.ino === made.ino;
	} catch {
		return false;
	}
};

/**
 * One clone at a time, as the agent does one piece of work at a time: a second is refused while one runs. `signal`
 * cancels it; a canceled clone leaves nothing behind.
 */
export class Cloner {
	private running: string | null = null;

	constructor(private readonly deps: CloneDeps = {}) {}

	async clone(req: CloneRequest, onProgress: (p: GitProgress) => void = () => undefined, signal?: AbortSignal): Promise<Cloned> {
		if (this.running !== null) throw new CloneProblem(`Already cloning ${this.running}. Wait for it to finish.`);
		// Only a repository the person's own list returned: the window cannot name one.
		const listed = listedAs(req.visible, req.repository);
		if (listed === undefined) throw new CloneProblem(`${req.repository} is not one of the repositories your GitHub account can see.`);
		const place = clonePlace(req.folder, listed);
		if (place.state === 'cloned') return { path: place.path, cloned: false };
		if (place.state === 'taken') throw new CloneProblem(notClonedOver(place.why));

		this.running = listed;
		const dest = place.path;
		// Made here, so this is the folder removed if it fails; an empty one already there is the person's, and stays.
		let made: { dev: number; ino: number } | null = null;
		try {
			mkdirSync(req.folder, { recursive: true });
			if (!existsSync(dest)) {
				mkdirSync(dest);
				const s = statSync(dest);
				made = { dev: s.dev, ino: s.ino };
			}
			await this.run(listed, dest, onProgress, signal);
			return { path: dest, cloned: true };
		} catch (err) {
			if (made !== null && sameFolder(dest, made)) rmSync(dest, { recursive: true, force: true });
			if (err instanceof Stopped) throw new CloneProblem(`Cloning ${listed} was stopped. Nothing was left behind.`);
			if (err instanceof NotStarted && err.missing) throw new CloneProblem(GIT_MISSING);
			if (err instanceof CloneProblem) throw err;
			if ((err as NodeJS.ErrnoException).code === 'ENOSPC') throw new CloneProblem(cloneProblem(listed, 'No space left on device'));
			throw new CloneProblem(`Could not clone ${listed}: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			this.running = null;
		}
	}

	private async run(repository: string, dest: string, onProgress: (p: GitProgress) => void, signal?: AbortSignal): Promise<void> {
		const url = (this.deps.urlOf ?? ((r) => `https://github.com/${r}.git`))(repository);
		const { code, output } = await runStreamed(this.deps.git ?? 'git', ['clone', '--progress', '--no-recurse-submodules', '--', url, dest], {
			// Never wait for a password typed into a window that has no terminal: fail, and say how to sign in.
			env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
			signal,
			// Progress is rewritten in place with carriage returns; each piece is a line.
			onText: (text) => {
				for (const piece of text.split(/[\r\n]/)) {
					const p = readProgress(piece);
					if (p) onProgress(p);
				}
			},
		});
		if (code !== 0) throw new CloneProblem(cloneProblem(repository, output));
	}
}
